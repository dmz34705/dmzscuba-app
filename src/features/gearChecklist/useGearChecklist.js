import { useEffect, useMemo, useState } from 'react';

import {
  assignItemToSetups,
  createGearId,
  normalizeGearItem,
  normalizeGearSetup,
} from './model';
import {
  loadGearState,
  persistGearAttachment,
  removeGearItemFiles,
  removeManagedGearAttachment,
  saveGearState,
} from './storage';

export default function useGearChecklist() {
  const [state, setState] = useState({ version: 2, items: [], setups: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    loadGearState()
      .then((stored) => { if (active) setState(stored); })
      .catch((nextError) => { if (active) setError(nextError?.message || 'Gear could not be loaded.'); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  const commit = async (next) => {
    const saved = await saveGearState(next);
    setState(saved);
    setError('');
    return saved;
  };

  const saveItem = async (draft) => {
    const itemId = draft.id || createGearId();
    const existing = state.items.find((item) => item.id === itemId);
    const attachments = [];
    const existingUris = new Set((existing?.attachments || []).map((attachment) => attachment.uri));
    try {
      for (const attachment of draft.attachments || []) {
        // Keep this serial: large cloud-backed manuals should not all compete for IO.
        // eslint-disable-next-line no-await-in-loop
        attachments.push(await persistGearAttachment(attachment, itemId));
      }
      const item = normalizeGearItem({ ...draft, id: itemId, attachments, createdAt: existing?.createdAt });
      const removedUris = (existing?.attachments || [])
        .filter((old) => !attachments.some((attachment) => attachment.id === old.id))
        .map((attachment) => attachment.uri);
      const items = existing
        ? state.items.map((entry) => (entry.id === itemId ? item : entry))
        : [...state.items, item];
      const setups = assignItemToSetups(state.setups, itemId, draft.setupIds || []);
      await commit({ ...state, items, setups });
      await Promise.all(removedUris.map((uri) => removeManagedGearAttachment(uri).catch(() => {})));
      return item;
    } catch (error) {
      await Promise.all(attachments.filter((attachment) => !existingUris.has(attachment.uri)).map((attachment) => removeManagedGearAttachment(attachment.uri).catch(() => {})));
      throw error;
    }
  };

  const deleteItem = async (itemId) => {
    const item = state.items.find((entry) => entry.id === itemId);
    const setups = state.setups.map((setup) => ({
      ...setup,
      itemIds: setup.itemIds.filter((id) => id !== itemId),
      checkedIds: setup.checkedIds.filter((id) => id !== itemId),
    }));
    await commit({ ...state, items: state.items.filter((entry) => entry.id !== itemId), setups });
    await removeGearItemFiles(item);
  };

  const saveSetup = async (draft) => {
    const existing = state.setups.find((setup) => setup.id === draft.id);
    const setup = normalizeGearSetup({ ...draft, createdAt: existing?.createdAt });
    const setups = existing
      ? state.setups.map((entry) => (entry.id === setup.id ? setup : entry))
      : [...state.setups, setup];
    await commit({ ...state, setups });
    return setup;
  };

  const deleteSetup = (setupId) => commit({ ...state, setups: state.setups.filter((setup) => setup.id !== setupId) });

  const toggleChecked = (setupId, itemId) => {
    const setups = state.setups.map((setup) => {
      if (setup.id !== setupId || !setup.itemIds.includes(itemId)) return setup;
      const checked = setup.checkedIds.includes(itemId);
      return { ...setup, checkedIds: checked ? setup.checkedIds.filter((id) => id !== itemId) : [...setup.checkedIds, itemId] };
    });
    return commit({ ...state, setups });
  };

  const resetSetup = (setupId) => commit({
    ...state,
    setups: state.setups.map((setup) => (setup.id === setupId ? { ...setup, checkedIds: [] } : setup)),
  });

  return useMemo(() => ({
    state,
    loaded,
    error,
    saveItem,
    deleteItem,
    saveSetup,
    deleteSetup,
    toggleChecked,
    resetSetup,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state, loaded, error]);
}
