import { useCallback, useEffect, useState } from 'react';

import { nextPlanForSetup, packPlan } from './model';
import { loadPlannerState, savePlannerState } from './usePlanner';

// The Gear Locker's view of trip packing: each setup's checklist shows (and ticks) the packing
// list of the next trip or dive day that uses it. `refresh` re-reads plans edited in the planner.
export default function usePlanPacking() {
  const [plans, setPlans] = useState([]);
  const refresh = useCallback(() => loadPlannerState().then((state) => setPlans(state.plans)).catch(() => {}), []);
  useEffect(() => { refresh(); }, [refresh]);

  const nextFor = useCallback((setupId) => nextPlanForSetup(plans, setupId), [plans]);
  const setPacked = useCallback(async (planId, keys, checked) => {
    const current = (await loadPlannerState()).plans;
    const saved = await savePlannerState({ plans: current.map((plan) => (plan.id === planId ? packPlan(plan, keys, checked) : plan)) });
    setPlans(saved.plans);
  }, []);

  return { plans, nextFor, setPacked, refresh };
}
