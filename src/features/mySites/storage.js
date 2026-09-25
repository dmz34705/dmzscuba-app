// "My sites": dive sites the diver pinned themselves (a quarry, a local shore entry the Ocean Atlas
// doesn't list). They show on the atlas's My sites layer, in its search, and in planner suggestions.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const MY_SITES_STORAGE_KEY = '@dmz-scuba/my-sites/v1';

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
export function normalizeMySite(value = {}, now = new Date()) {
  const latitude = Number(value.latitude), longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const name = clean(value.name, 120);
  if (!name) return null;
  return {
    id: /^my-[\w-]{4,80}$/.test(value.id || '') ? value.id : `my-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name, latitude: Math.round(latitude * 1e6) / 1e6, longitude: Math.round(longitude * 1e6) / 1e6,
    notes: clean(value.notes, 1000), createdAt: clean(value.createdAt, 40) || now.toISOString(),
  };
}

export async function loadMySites(storage = AsyncStorage) {
  try {
    const raw = await storage.getItem(MY_SITES_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return (Array.isArray(list) ? list : []).map((site) => normalizeMySite(site)).filter(Boolean);
  } catch {
    return [];
  }
}

async function saveMySites(sites, storage) {
  await storage.setItem(MY_SITES_STORAGE_KEY, JSON.stringify(sites));
  return sites;
}

export async function addMySite(value, storage = AsyncStorage) {
  const site = normalizeMySite(value);
  if (!site) throw new Error('A site needs a name and a map location.');
  const current = await loadMySites(storage);
  await saveMySites([...current.filter((entry) => entry.id !== site.id), site], storage);
  return site;
}

export async function removeMySite(id, storage = AsyncStorage) {
  const current = await loadMySites(storage);
  return saveMySites(current.filter((entry) => entry.id !== id), storage);
}
