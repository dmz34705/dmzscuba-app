import { useEffect, useMemo, useState } from 'react';

import {
  addToSetupForRequirement,
  applyChecks,
  assignItemToSetups,
  createGearId,
  diveComputerLogStats,
  isLockedLogbookComputer,
  moveFloatingItem,
  normalizeGearItem,
  normalizeGearSetup,
  resetSetupReview,
  skipRequirement,
  setAccessoryChoice,
  syncDiveComputers,
  unlinkFromSet,
} from './model';
import { loadIndex } from '../../lib/diveLog/storage';
import {
  loadGearState,
  persistGearAttachment,
  removeGearItemFiles,
  removeManagedGearAttachment,
  saveGearState,
} from './storage';

export default function useGearChecklist() {
  const [state, setState] = useState({ version: 2, items: [], setups: [], dismissedDeviceKeys: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [diveRows, setDiveRows] = useState([]);

  // Opening the locker also picks up any dive computer the logbook has downloaded from.
  useEffect(() => {
    let active = true;
    Promise.all([loadGearState(), loadIndex().catch(() => [])])
      .then(async ([stored, rows]) => {
        const synced = syncDiveComputers(stored, rows);
        const next = synced === stored ? stored : await saveGearState(synced);
        if (active) { setState(next); setDiveRows(rows); }
      })
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

  // Saves several items in one commit — a wizard-built assembly plus any accessories it just
  // quick-added. Calling saveItem in a loop would race itself: each call closes over the same
  // `state` from this render, so a later call can't see what an earlier call in the same batch
  // just wrote, and its commit clobbers it. Folding every draft into one items array before the
  // single commit() avoids that entirely.
  const saveItems = async (drafts) => {
    let nextItems = state.items;
    let nextSetups = state.setups;
    const saved = [];
    const uploaded = [];
    try {
      for (const draft of drafts) {
        const itemId = draft.id || createGearId();
        const existing = nextItems.find((entry) => entry.id === itemId);
        const attachments = [];
        for (const attachment of draft.attachments || []) {
          // eslint-disable-next-line no-await-in-loop
          attachments.push(await persistGearAttachment(attachment, itemId));
        }
        uploaded.push(...attachments);
        const item = normalizeGearItem({ ...draft, id: itemId, attachments, createdAt: existing?.createdAt });
        nextItems = existing ? nextItems.map((entry) => (entry.id === itemId ? item : entry)) : [...nextItems, item];
        nextSetups = assignItemToSetups(nextSetups, itemId, draft.setupIds || []);
        saved.push(item);
      }
    } catch (error) {
      await Promise.all(uploaded.map((attachment) => removeManagedGearAttachment(attachment.uri).catch(() => {})));
      throw error;
    }
    await commit({ ...state, items: nextItems, setups: nextSetups });
    return saved;
  };

  const deleteItem = async (itemId) => {
    const item = state.items.find((entry) => entry.id === itemId);
    if (isLockedLogbookComputer(item, diveRows)) throw new Error('This dive computer is in your logbook, so it stays in your locker. Mark it Retired instead.');
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

  // Checking off a floating item (a transmitter, a full-face mask) also moves it to this setup — see applyChecks.
  const toggleChecked = (setupId, checklistKey) => {
    const setup = state.setups.find((entry) => entry.id === setupId);
    const checked = Boolean(setup?.checkedIds.includes(checklistKey));
    return commit(applyChecks(state, setupId, [checklistKey], !checked));
  };

  // Checking a parent row (the drysuit) toggles every one of its checklist keys — itself, its
  // tracked parts, its linked accessories — together. A loop of toggleChecked calls would clobber
  // itself the same way the wizard's save used to; this sets them all in the one commit instead.
  const setCheckedKeys = (setupId, keys, checked) => commit(applyChecks(state, setupId, keys, checked));

  // Put a floating item on a setup ('' takes it off every setup).
  const moveFloating = (itemId, setupId) => commit(moveFloatingItem(state, itemId, setupId));

  // The setup-completeness review: add a missing item, leave it out, or start the review over.
  const updateSetup = (setupId, change) => commit({ ...state, setups: state.setups.map((setup) => (setup.id === setupId ? change(setup) : setup)) });
  const addForRequirement = (setupId, itemId) => updateSetup(setupId, (setup) => addToSetupForRequirement(setup, itemId, state.items));
  const leaveOut = (setupId, key) => updateSetup(setupId, (setup) => skipRequirement(setup, key, state.items));
  const reviewAgain = (setupId) => updateSetup(setupId, resetSetupReview);

  // Track a cylinder on its own instead of inside its doubles set / sidemount pair.
  const unlinkCylinder = (itemId) => commit(unlinkFromSet(state, itemId));

  // Which of an item's alternatives (e.g. undergarments for a drysuit) this setup packs.
  const chooseAccessories = (setupId, itemId, accessoryIds) => commit({
    ...state, setups: state.setups.map((setup) => (setup.id === setupId ? setAccessoryChoice(setup, itemId, accessoryIds, state.items) : setup)),
  });

  const resetSetup = (setupId) => commit({
    ...state,
    setups: state.setups.map((setup) => (setup.id === setupId ? { ...setup, checkedIds: [] } : setup)),
  });

  return useMemo(() => ({
    state,
    loaded,
    error,
    saveItem,
    saveItems,
    deleteItem,
    saveSetup,
    deleteSetup,
    toggleChecked,
    setCheckedKeys,
    resetSetup,
    moveFloating,
    chooseAccessories,
    unlinkCylinder,
    addForRequirement,
    leaveOut,
    reviewAgain,
    diveComputerStats: (deviceKey) => diveComputerLogStats(diveRows, deviceKey),
    isLocked: (item) => isLockedLogbookComputer(item, diveRows),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state, loaded, error, diveRows]);
}
