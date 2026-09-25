import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { subscribeAccountData } from '../../lib/accountDataSync';
import { loadIndex } from '../../lib/diveLog/storage';
import { applyChecks } from '../gearChecklist/model';
import { loadGearState, saveGearState } from '../gearChecklist/storage';
import { normalizePlan, normalizePlannerState, planAlerts } from './model';

// Plans live on this device (and in the development backups). Account sync can carry them once
// the sync service accepts a `plan` record kind.
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
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [state, gearState, rows] = await Promise.all([loadPlannerState(), loadGearState().catch(() => null), loadIndex().catch(() => [])]);
    setPlans(state.plans);
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

  // Tick items on the setup's own Gear Locker checklist, so packing progress is one list everywhere.
  const setPacked = useCallback(async (setupId, keys, checked) => {
    const latest = await loadGearState();
    const saved = await saveGearState(applyChecks(latest, setupId, keys, checked));
    setGear(saved);
  }, []);

  const context = useMemo(() => ({ gear, certifications, dives }), [gear, certifications, dives]);
  const alertsFor = useCallback((plan) => planAlerts(plan, { ...context, now: new Date() }), [context]);

  return { plans, gear, dives, loaded, error, savePlan, deletePlan, setPacked, alertsFor, refresh };
}
