import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadGearState } from '../gearChecklist/storage';
import { emptyLogState, latestByTank, lockerTanks, recentRentalTanks } from './nitroxLog';
import { loadNitroxLog, saveNitroxLog } from './storage';

export default function useNitroxLog() {
  const [state, setState] = useState(emptyLogState);
  const [gear, setGear] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([loadNitroxLog(), loadGearState().catch(() => null)]).then(([log, gearState]) => {
      if (!active) return;
      setState(log);
      setGear(gearState);
      setLoaded(true);
    });
    return () => { active = false; };
  }, []);

  const current = useRef(state);
  current.current = state;

  const commit = useCallback(async (update) => {
    const next = typeof update === 'function' ? update(current.current) : update;
    current.current = next;
    setState(next);
    const saved = await saveNitroxLog(next);
    current.current = saved;
    setState(saved);
  }, []);

  const addEntry = useCallback((entry) => commit((s) => ({ ...s, entries: [entry, ...s.entries] })), [commit]);
  const updateEntry = useCallback((id, patch) => commit((s) => ({
    ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  })), [commit]);
  const removeEntry = useCallback((id) => commit((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id) })), [commit]);
  const setFacilityName = useCallback((name) => commit((s) => ({ ...s, facility: { ...s.facility, name } })), [commit]);

  const personal = useMemo(() => state.entries.filter((e) => e.kind === 'personal'), [state.entries]);
  const facility = useMemo(() => state.entries.filter((e) => e.kind === 'facility'), [state.entries]);
  const latest = useMemo(() => latestByTank(state.entries), [state.entries]);
  const tanks = useMemo(() => lockerTanks(gear), [gear]);
  const rentals = useMemo(() => recentRentalTanks(state.entries), [state.entries]);

  return {
    loaded, personal, facility, latest, tanks, rentals, facilityName: state.facility.name,
    addEntry, updateEntry, removeEntry, setFacilityName,
  };
}
