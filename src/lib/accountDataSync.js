import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { syncAccountRequest } from './accountApi';
import { canonical, reconcile } from './accountSyncEngine';
import { createId } from './diveLog/schema';
import { rebuildIndex, migrateToV2 } from './diveLog/storage';

const ROOT = '@dmz-scuba/account-sync/dev-v1/';
const DIVE = '@dmz-scuba/dive-log/dive-v2/';
const LOG = '@dmz-scuba/dive-log/log-v2/';
const GEAR = '@dmz-scuba/gear-checklist/v1';
const listeners = new Set();
const dataListeners = new Set();
let owner = null;
let generation = 0;
let running = null;
let status = { state: 'local', message: 'Saved on this device.', conflicts: 0 };
export const getDataSyncStatus = () => status;
export const subscribeDataSync = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const subscribeAccountData = (fn) => { dataListeners.add(fn); return () => dataListeners.delete(fn); };
function announce(next) { status = { ...status, ...next }; listeners.forEach((fn) => fn(status)); }
function changed() { dataListeners.forEach((fn) => fn()); }
const read = async (key, fallback) => { const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; };
const emptyGear = () => ({ version: 2, items: [], setups: [], dismissedDeviceKeys: [] });
const ownedKey = (key) => key.startsWith('@dmz-scuba/dive-log/') || key === GEAR;

// Each account keeps its own complete on-device vault. Guest records are adopted only once.
// The journal makes interrupted account switches recoverable without uploading mixed data.
export async function prepareAccountData(userId) {
  if (!userId) throw new Error('A verified account is required.');
  generation += 1; owner = null;
  if (running) await running.catch(() => {});
  let journal = await read(`${ROOT}switch`, null);
  if (journal) await restoreVault(journal);
  const previous = await AsyncStorage.getItem(`${ROOT}owner`);
  if (previous && previous !== userId) {
    const keys = (await AsyncStorage.getAllKeys()).filter(ownedKey);
    const entries = await AsyncStorage.multiGet(keys);
    await AsyncStorage.setItem(`${ROOT}vault/${previous}`, JSON.stringify(entries));
    journal = { userId, entries: await read(`${ROOT}vault/${userId}`, []) };
    await AsyncStorage.setItem(`${ROOT}switch`, JSON.stringify(journal));
    await restoreVault(journal);
  } else await AsyncStorage.setItem(`${ROOT}owner`, userId);
  owner = userId;
  await migrateToV2();
  changed();
}
async function restoreVault({ userId, entries }) {
  const keys = (await AsyncStorage.getAllKeys()).filter(ownedKey);
  if (keys.length) await AsyncStorage.multiRemove(keys);
  if (entries.length) await AsyncStorage.multiSet(entries.filter(([, value]) => value != null));
  await AsyncStorage.setItem(`${ROOT}owner`, userId);
  await AsyncStorage.removeItem(`${ROOT}switch`);
}
export function stopAccountDataSync() { generation += 1; owner = null; announce({ state: 'local', message: 'Saved on this device. Sign in to sync.', conflicts: 0 }); }

async function snapshot() {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(DIVE) || key.startsWith(LOG));
  const entries = keys.length ? await AsyncStorage.multiGet(keys) : [];
  const records = entries.filter(([, value]) => value != null).map(([key, value]) => {
    const data = JSON.parse(value);
    return { kind: key.startsWith(DIVE) ? 'dive' : 'computerLog', id: data.id, data, deleted: !!data.deletedAt };
  });
  const gear = await read(GEAR, null);
  for (const [list, kind] of [['items', 'gear'], ['setups', 'setup']]) {
    for (const data of gear?.[list] || []) records.push({ kind, id: data.id, data, deleted: false });
  }
  if (gear) records.push({ kind: 'preferences', id: 'gear', data: { id: 'gear', dismissedDeviceKeys: gear.dismissedDeviceKeys || [] }, deleted: false });
  const priority = await read('@dmz-scuba/dive-log/computer-priority-v1', null);
  if (priority) records.push({ kind: 'preferences', id: 'computer-priority', data: { id: 'computer-priority', value: priority }, deleted: false });
  return records;
}
async function current(kind, id) { return (await snapshot()).find((r) => r.kind === kind && r.id === id); }
async function apply(record) {
  const { kind, id, data, deleted } = record;
  if (kind === 'dive' || kind === 'computerLog') {
    const key = `${kind === 'dive' ? DIVE : LOG}${id}`;
    if (deleted) { await AsyncStorage.removeItem(key); return; }
    const local = await read(key, {});
    await AsyncStorage.setItem(key, JSON.stringify({ ...data, ...(kind === 'dive' ? { photos: local.photos || [], sync: { status: 'synced' } } : {}) }));
  } else if (kind === 'gear' || kind === 'setup') {
    const gear = await read(GEAR, emptyGear());
    const list = kind === 'gear' ? 'items' : 'setups';
    const existing = (gear[list] || []).find((r) => r.id === id);
    gear[list] = (gear[list] || []).filter((r) => r.id !== id);
    if (!deleted) gear[list].push({ ...data, ...(kind === 'gear' ? { attachments: existing?.attachments || [] } : {}) });
    await AsyncStorage.setItem(GEAR, JSON.stringify(gear));
  } else if (id === 'gear' && !deleted) {
    const gear = await read(GEAR, emptyGear());
    await AsyncStorage.setItem(GEAR, JSON.stringify({ ...gear, dismissedDeviceKeys: data.dismissedDeviceKeys || [] }));
  } else if (id === 'computer-priority' && !deleted) {
    await AsyncStorage.setItem('@dmz-scuba/dive-log/computer-priority-v1', JSON.stringify(data.value || []));
  }
}

export async function syncAccountData() {
  if (running) return running;
  if (!owner) return;
  const userId = owner; const ticket = generation;
  const active = () => owner === userId && generation === ticket;
  let applied = false;
  running = (async () => {
    announce({ state: 'syncing', message: 'Syncing your logbook and gear locker…' });
    const state = await read(`${ROOT}state/${userId}`, { records: {}, pending: {}, conflicts: {} });
    const request = (path, options) => syncAccountRequest(path, options, userId);
    const remote = []; let after = '';
    do {
      const page = await request(after ? `?after=${encodeURIComponent(after)}` : '');
      remote.push(...page.records); after = page.next;
    } while (after && active());
    if (!active()) return;
    const result = await reconcile({ local: await snapshot(), remote, state, request,
      persist: (value) => AsyncStorage.setItem(`${ROOT}state/${userId}`, JSON.stringify(value)),
      apply: async (record) => { await apply(record); applied = true; }, current, active, makeId: createId });
    if (!active()) return;
    announce({ state: result.conflicts ? 'conflict' : 'synced', conflicts: result.conflicts,
      lastSyncedAt: new Date().toISOString(), message: result.conflicts ? `${result.conflicts} changed records need your review. Both versions are saved.` : 'Logbook and gear records are synced to your account.' });
  })().catch((error) => {
    if (active()) announce({ state: 'error', message: error.message || 'Sync will retry when connected. Your device data is safe.' });
  }).finally(async () => {
    // Earlier records may have downloaded successfully before a later request failed.
    if (applied && active()) { await rebuildIndex().catch(() => {}); changed(); }
    running = null;
  });
  return running;
}

export async function nextSyncConflict() {
  if (!owner) return null;
  const state = await read(`${ROOT}state/${owner}`, { conflicts: {} });
  const key = Object.keys(state.conflicts)[0];
  return key ? { key, ...state.conflicts[key] } : null;
}
export async function resolveSyncConflict(key, choice) {
  if (running) await running;
  const userId = owner;
  if (!userId) return;
  const state = await read(`${ROOT}state/${userId}`, null);
  const conflict = state?.conflicts[key]; if (!conflict) return;
  // Keep both original versions in a local recovery archive, including after resolution.
  await AsyncStorage.setItem(`${ROOT}resolved/${userId}/${Date.now()}-${createId()}`, JSON.stringify(conflict));
  const remote = conflict.remote;
  state.records[key] = { revision: remote.revision, value: remote.deleted ? 'deleted' : `active:${canonical(remote.data, remote.kind)}` };
  if (choice === 'cloud') { await apply(remote); await rebuildIndex(); changed(); }
  delete state.conflicts[key]; delete state.pending[key];
  await AsyncStorage.setItem(`${ROOT}state/${userId}`, JSON.stringify(state));
  await syncAccountData();
}
export function startAccountDataSync() {
  syncAccountData();
  const timer = setInterval(() => { if (AppState.currentState === 'active') syncAccountData(); }, 30000);
  const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') syncAccountData(); });
  return () => { clearInterval(timer); subscription.remove(); stopAccountDataSync(); };
}
