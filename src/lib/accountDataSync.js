import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { syncAccountRequest } from './accountApi';
import { bulkDeletion, canonical, reconcile } from './accountSyncEngine';
import { createId } from './diveLog/schema';
import { rebuildIndex, migrateToV2 } from './diveLog/storage';

const ROOT = '@dmz-scuba/account-sync/dev-v1/';
const DIVE = '@dmz-scuba/dive-log/dive-v2/';
const LOG = '@dmz-scuba/dive-log/log-v2/';
const GEAR = '@dmz-scuba/gear-checklist/v1';
const PLANNER = '@dmz-scuba/planner/v1';
const ADVICE = '@dmz-scuba/gear-advice/v1';
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
// Personal records that stay on the device (not cloud-synced) but still belong
// to whoever is signed in: switching accounts must hide them from the next
// person. Device preferences (units, Atlas view, sort order, analyzer pairing)
// are deliberately left shared.
const PERSONAL_DEVICE_KEYS = new Set([
  '@dmz-scuba/insurance/v1',
  '@dmz-scuba/location-log-v1',
  '@dmz-scuba/location-suggestion-handled-v1',
  '@dmz-scuba/nitrox-log/v1',
  '@dmz-scuba/my-sites/v1',
  '@dmz-scuba/site-link-handled/v1',
]);
const ownedKey = (key) => key.startsWith('@dmz-scuba/dive-log/') || key === GEAR || key === PLANNER || key === ADVICE || PERSONAL_DEVICE_KEYS.has(key);

// Each account keeps its own complete on-device vault. Guest records are adopted only once.
// The journal makes interrupted account switches recoverable without uploading mixed data.
export async function prepareAccountData(userId) {
  if (!userId) throw new Error('A verified account is required.');
  generation += 1; owner = null;
  if (running) await running.catch(() => {});
  let journal = await read(`${ROOT}switch`, null);
  if (journal) await restoreVault(journal);
  const previous = await AsyncStorage.getItem(`${ROOT}owner`);
  // Signed out with no owner (e.g. after deleting another account) but this account's records are in its
  // vault: they must come back. Adopting what's on screen instead would leave the vault unused and the
  // next sync would delete every one of this account's cloud records.
  const vaulted = !previous && (await AsyncStorage.getItem(`${ROOT}vault/${userId}`)) != null;
  if ((previous && previous !== userId) || vaulted) {
    const keys = (await AsyncStorage.getAllKeys()).filter(ownedKey);
    const entries = await AsyncStorage.multiGet(keys);
    // Signed-out records are set aside, never discarded.
    await AsyncStorage.setItem(previous ? `${ROOT}vault/${previous}` : `${ROOT}signed-out/${Date.now()}`, JSON.stringify(entries));
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
// After the account is deleted: forget its sync state and saved vault. Records
// currently on screen stay on this phone as signed-out (guest) data.
export async function releaseDeletedAccountData(userId) {
  if (!userId) return;
  generation += 1; owner = null;
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key === `${ROOT}vault/${userId}` || key === `${ROOT}state/${userId}`
    || key.startsWith(`${ROOT}resolved/${userId}/`));
  if ((await AsyncStorage.getItem(`${ROOT}owner`)) === userId) keys.push(`${ROOT}owner`);
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
export function stopAccountDataSync() { generation += 1; owner = null; announce({ state: 'local', bulk: null, message: 'Saved on this device. Sign in to sync.', conflicts: 0 }); }

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
  const planner = await read(PLANNER, null);
  const advice = await read(ADVICE, null);
  if (advice) records.push({ kind: 'preferences', id: 'gear-advice', data: { id: 'gear-advice', value: advice }, deleted: false });
  for (const data of planner?.plans || []) records.push({ kind: 'plan', id: data.id, data, deleted: false });
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
  } else if (kind === 'plan') {
    const planner = await read(PLANNER, { version: 1, plans: [] });
    planner.plans = (planner.plans || []).filter((entry) => entry.id !== id);
    if (!deleted) planner.plans.push(data);
    await AsyncStorage.setItem(PLANNER, JSON.stringify({ version: 1, plans: planner.plans }));
  } else if (kind === 'preferences' && id === 'gear-advice') {
    if (deleted) await AsyncStorage.removeItem(ADVICE);
    else await AsyncStorage.setItem(ADVICE, JSON.stringify(data.value || {}));
  } else if (id === 'gear' && !deleted) {
    const gear = await read(GEAR, emptyGear());
    await AsyncStorage.setItem(GEAR, JSON.stringify({ ...gear, dismissedDeviceKeys: data.dismissedDeviceKeys || [] }));
  } else if (id === 'computer-priority' && !deleted) {
    await AsyncStorage.setItem('@dmz-scuba/dive-log/computer-priority-v1', JSON.stringify(data.value || []));
  }
}

// `choice` answers a paused bulk deletion (see bulkDeletion): 'restore' undoes it (missing records come
// back from the account, or this phone's records are uploaded over the cloud deletions), 'apply'
// carries it out. Any other value (including a button's press event) is a normal sync.
export async function syncAccountData(options) {
  const choice = ['restore', 'apply'].includes(options?.bulk) ? options.bulk : null;
  if (running) { if (!choice) return running; await running.catch(() => {}); }
  if (!owner) return;
  const userId = owner; const ticket = generation;
  const active = () => owner === userId && generation === ticket;
  let applied = false;
  running = (async () => {
    announce({ state: 'syncing', message: 'Syncing your logbook, gear locker, and trip plans…' });
    const state = await read(`${ROOT}state/${userId}`, { records: {}, pending: {}, conflicts: {} });
    const request = (path, options) => syncAccountRequest(path, options, userId);
    const remote = []; let after = '';
    do {
      const page = await request(`?advice=1${after ? `&after=${encodeURIComponent(after)}` : ''}`);
      remote.push(...page.records); after = page.next;
    } while (after && active());
    if (!active()) return;
    const local = await snapshot();
    const bulk = bulkDeletion({ local, remote, state });
    if (bulk && !choice) {
      announce({ state: 'paused', bulk, message: bulk.direction === 'upload'
        ? `Sync paused: ${bulk.count} of your ${bulk.known} synced records are missing from this phone. Nothing was deleted from your account.`
        : `Sync paused: your account has ${bulk.count} of your ${bulk.known} records marked deleted. Nothing was removed from this phone.` });
      return;
    }
    if (bulk && choice === 'restore') {
      const locals = new Set(local.map((r) => `${r.kind}/${r.id}`));
      for (const [key, base] of Object.entries(state.records)) {
        if (base.value === 'deleted') continue;
        // Missing here: forget the baseline so the account's copy downloads again.
        if (bulk.direction === 'upload' && !locals.has(key)) { delete state.records[key]; delete state.pending[key]; }
        // Deleted in the account: baseline the deletion so this phone's copy uploads over it.
        const there = remote.find((r) => `${r.kind}/${r.id}` === key);
        if (bulk.direction === 'download' && there?.deleted && locals.has(key)) state.records[key] = { revision: there.revision, value: 'deleted' };
      }
      await AsyncStorage.setItem(`${ROOT}state/${userId}`, JSON.stringify(state));
    }
    const result = await reconcile({ local, remote, state, request, confirmBulk: choice === 'apply',
      persist: (value) => AsyncStorage.setItem(`${ROOT}state/${userId}`, JSON.stringify(value)),
      apply: async (record) => { await apply(record); applied = true; }, current, active, makeId: createId });
    if (!active()) return;
    announce({ state: result.conflicts ? 'conflict' : 'synced', bulk: null, conflicts: result.conflicts,
      lastSyncedAt: new Date().toISOString(), message: result.conflicts ? `${result.conflicts} changed records need your review. Both versions are saved.` : 'Logbook, gear, and trip plans are synced to your account.' });
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
