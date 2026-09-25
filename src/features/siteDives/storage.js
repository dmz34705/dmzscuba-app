import AsyncStorage from '@react-native-async-storage/async-storage';

import { catalogSites } from '../oceanAtlas/catalog';
import { loadMySites } from '../mySites/storage';
import { loadPlannerState } from '../planner/usePlanner';
import { matchDiveSite } from './siteMatch';

// Dives whose "link to this site?" offer was answered, so it isn't asked again.
export const SITE_LINK_HANDLED_KEY = '@dmz-scuba/site-link-handled/v1';

export async function loadHandledSiteLinkIds(storage = AsyncStorage) {
  try {
    const raw = await storage.getItem(SITE_LINK_HANDLED_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function markSiteLinkHandled(diveId, storage = AsyncStorage) {
  const ids = await loadHandledSiteLinkIds(storage);
  if (!ids.includes(diveId)) await storage.setItem(SITE_LINK_HANDLED_KEY, JSON.stringify([...ids, diveId].slice(-5000)));
}

// A matcher over the diver's plans, pinned sites and the Ocean Atlas catalog, loaded once per use.
export async function loadSiteMatcher() {
  const [planner, mySites] = await Promise.all([loadPlannerState().catch(() => ({ plans: [] })), loadMySites().catch(() => [])]);
  let sites = [];
  try { sites = catalogSites(); } catch { sites = []; }
  return (point, dive) => matchDiveSite(point, dive, { plans: planner.plans, mySites, sites });
}
