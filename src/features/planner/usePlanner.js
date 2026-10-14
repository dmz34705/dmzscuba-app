import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { subscribeAccountData, syncAccountData } from '../../lib/accountDataSync';
import { loadIndex } from '../../lib/diveLog/storage';
import { moveFloatingForChecks } from '../gearChecklist/model';
import { loadGearState, saveGearState } from '../gearChecklist/storage';
import { loadInsuranceState } from '../insurance/storage';
import { normalizePlan, normalizePlannerState, packPlan, planAlerts } from './model';

// Plans live on this device, in development backups, and sync as account `plan` records.
export const PLANNER_STORAGE_KEY = '@dmz-scuba/planner/v1';

export async function loadPlannerState(storage = AsyncStorage) {
  try {
    const raw = await storage.getItem(PLANNER_STORAGE_KEY);
    return normalizePlannerState(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizePlannerState(null);
  }
}

export async function savePlannerState(state, storage = AsyncStorage) {
  const normalized = normalizePlannerState(state);
  await storage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

// The planner reads the Gear Locker and logbook so every plan is checked against current gear
// service dates, packing progress and dive history; certifications come from the account.
export default function usePlanner({ certifications = null } = {}) {
  const [plans, setPlans] = useState([]);
  const [gear, setGear] = useState({ items: [], setups: [] });
  const [dives, setDives] = useState([]);
  const [insurance, setInsurance] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [state, gearState, rows, policies] = await Promise.all([loadPlannerState(), loadGearState().catch(() => null), loadIndex().catch(() => []), loadInsuranceState().catch(() => null)]);
    setPlans(state.plans);
    if (policies) setInsurance(policies.policies);
    if (gearState) setGear(gearState);
    setDives(Array.isArray(rows) ? rows : []);
  }, []);

  useEffect(() => {
    let alive = true;
    refresh().catch((next) => { if (alive) setError(next?.message || 'Your plans could not be loaded.'); }).finally(() => { if (alive) setLoaded(true); });
    const unsubscribe = subscribeAccountData(() => { refresh().catch(() => {}); });
    return () => { alive = false; unsubscribe(); };
  }, [refresh]);

  const persist = useCallback(async (nextPlans) => {
    const saved = await savePlannerState({ plans: nextPlans });
    setPlans(saved.plans);
    setError('');
    // Plans are account data too; don't make a diver wait for the periodic sync after editing.
    void syncAccountData();
    return saved.plans;
  }, []);

  const savePlan = useCallback(async (draft) => {
    const plan = normalizePlan(draft);
    const current = (await loadPlannerState()).plans;
    const exists = current.some((entry) => entry.id === plan.id);
    await persist(exists ? current.map((entry) => (entry.id === plan.id ? plan : entry)) : [...current, plan]);
    return plan;
  }, [persist]);

  const deletePlan = useCallback(async (planId) => {
    const current = (await loadPlannerState()).plans;
    await persist(current.filter((entry) => entry.id !== planId));
  }, [persist]);

  // Tick items on this plan's own packing list (the Gear Locker shows the same list for the
  // setup's next trip). Packing a floating item still moves it onto the setup in the Gear Locker.
  const setPacked = useCallback(async (planId, keys, checked) => {
    const current = (await loadPlannerState()).plans;
    const plan = current.find((entry) => entry.id === planId);
    if (!plan) return;
    await persist(current.map((entry) => (entry.id === planId ? packPlan(entry, keys, checked) : entry)));
    if (checked && plan.setupId) {
      const latest = await loadGearState();
      const moved = moveFloatingForChecks(latest, plan.setupId, keys);
      if (moved !== latest) setGear(await saveGearState(moved));
    }
  }, [persist]);

  const context = useMemo(() => ({ gear, certifications, dives, insurance }), [gear, certifications, dives, insurance]);
  const alertsFor = useCallback((plan) => planAlerts(plan, { ...context, now: new Date() }), [context]);

  return { plans, gear, dives, insurance, loaded, error, savePlan, deletePlan, setPacked, alertsFor, refresh };
}
