import { useCallback, useEffect, useState } from 'react';

import { normalizePolicy } from './model';
import { loadInsuranceState, persistInsuranceDocument, removeInsuranceDocument, saveInsuranceState } from './storage';

// The diver's insurance policies. Saving copies any new documents into the app and deletes the
// copies of documents that were removed; deleting a policy deletes its documents.
export default function useInsurance() {
  const [policies, setPolicies] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(() => loadInsuranceState().then((state) => setPolicies(state.policies)).catch(() => {}).finally(() => setLoaded(true)), []);
  useEffect(() => { refresh(); }, [refresh]);

  const savePolicy = useCallback(async (draft) => {
    const policy = normalizePolicy(draft);
    const current = (await loadInsuranceState()).policies;
    const previous = current.find((entry) => entry.id === policy.id);
    const copied = [];
    try {
      for (const document of policy.documents) {
        const saved = await persistInsuranceDocument(document, policy.id);
        if (saved.uri !== document.uri) copied.push(saved.uri);
        document.uri = saved.uri;
      }
    } catch (error) {
      await Promise.all(copied.map((uri) => removeInsuranceDocument(uri).catch(() => {})));
      throw error;
    }
    const next = previous ? current.map((entry) => (entry.id === policy.id ? policy : entry)) : [...current, policy];
    const saved = await saveInsuranceState({ policies: next });
    setPolicies(saved.policies);
    const kept = new Set(policy.documents.map((document) => document.uri));
    await Promise.all((previous?.documents || []).filter((document) => !kept.has(document.uri)).map((document) => removeInsuranceDocument(document.uri).catch(() => {})));
    return policy;
  }, []);

  const deletePolicy = useCallback(async (policyId) => {
    const current = (await loadInsuranceState()).policies;
    const policy = current.find((entry) => entry.id === policyId);
    const saved = await saveInsuranceState({ policies: current.filter((entry) => entry.id !== policyId) });
    setPolicies(saved.policies);
    await Promise.all((policy?.documents || []).map((document) => removeInsuranceDocument(document.uri).catch(() => {})));
  }, []);

  return { policies, loaded, refresh, savePolicy, deletePolicy };
}
