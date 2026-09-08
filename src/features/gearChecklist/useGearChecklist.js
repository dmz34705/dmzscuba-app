import { useEffect, useMemo, useState } from 'react';

import {
  assignItemToLists,
  createGearId,
  normalizeGearItem,
  normalizeGearList,
} from './model';
import {
  loadGearState,
  persistGearAttachment,
  removeGearItemFiles,
  removeManagedGearAttachment,
  saveGearState,
} from './storage';

export default function useGearChecklist() {
  const [state, setState] = useState({ version: 1, items: [], lists: [] });
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
      const lists = assignItemToLists(state.lists, itemId, draft.listIds || []);
      await commit({ ...state, items, lists });
      await Promise.all(removedUris.map((uri) => removeManagedGearAttachment(uri).catch(() => {})));
      return item;
    } catch (error) {
      await Promise.all(attachments.filter((attachment) => !existingUris.has(attachment.uri)).map((attachment) => removeManagedGearAttachment(attachment.uri).catch(() => {})));
      throw error;
    }
  };

  const deleteItem = async (itemId) => {
    const item = state.items.find((entry) => entry.id === itemId);
    const lists = state.lists.map((list) => ({
      ...list,
      itemIds: list.itemIds.filter((id) => id !== itemId),
      checkedIds: list.checkedIds.filter((id) => id !== itemId),
    }));
    await commit({ ...state, items: state.items.filter((entry) => entry.id !== itemId), lists });
    await removeGearItemFiles(item);
  };

  const saveList = async (draft) => {
    const existing = state.lists.find((list) => list.id === draft.id);
    const list = normalizeGearList({ ...draft, createdAt: existing?.createdAt });
    const lists = existing
      ? state.lists.map((entry) => (entry.id === list.id ? list : entry))
      : [...state.lists, list];
    await commit({ ...state, lists });
    return list;
  };

  const deleteList = (listId) => commit({ ...state, lists: state.lists.filter((list) => list.id !== listId) });

  const toggleChecked = (listId, itemId) => {
    const lists = state.lists.map((list) => {
      if (list.id !== listId || !list.itemIds.includes(itemId)) return list;
      const checked = list.checkedIds.includes(itemId);
      return { ...list, checkedIds: checked ? list.checkedIds.filter((id) => id !== itemId) : [...list.checkedIds, itemId] };
    });
    return commit({ ...state, lists });
  };

  const resetList = (listId) => commit({
    ...state,
    lists: state.lists.map((list) => (list.id === listId ? { ...list, checkedIds: [] } : list)),
  });

  return useMemo(() => ({
    state,
    loaded,
    error,
    saveItem,
    deleteItem,
    saveList,
    deleteList,
    toggleChecked,
    resetList,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state, loaded, error]);
}
