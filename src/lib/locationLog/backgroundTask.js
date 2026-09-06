// Defines the background location task. This MUST run at module load —
// TaskManager.defineTask has to be called unconditionally, outside any React
// component or hook — because iOS can relaunch the app fully in the
// background just to deliver a location update, and the task has to already
// be registered by the time that happens. Imported once from index.js,
// before anything else.

import { appendLocationPoint, pruneLocationPoints } from './storage';

// expo-task-manager's own JS eagerly calls requireNativeModule('ExpoTaskManager')
// the moment it's imported (confirmed in its source) — not just when a
// function is called. A build that predates this feature (or Expo Go) throws
// synchronously right there, and since this file is imported unconditionally
// from index.js, an uncaught throw here would crash the entire app on
// launch, not just leave this feature unavailable. require() inside try/catch
// (not a static import, which can't be conditionally skipped) is the same
// pattern diveComputerBle.js already uses for react-native-ble-plx.
let TaskManager = null;
try {
  // eslint-disable-next-line global-require
  TaskManager = require('expo-task-manager');
} catch {
  TaskManager = null;
}

export const LOCATION_TASK_NAME = 'dmz-scuba-background-location';

// 90 days: long enough to cover a diver who doesn't get around to syncing
// their computer for a while, short enough that the log doesn't become an
// indefinite personal location history.
export const LOCATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

if (TaskManager) {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      // eslint-disable-next-line no-console
      console.log('[location-log] background task error:', error.message);
      return;
    }
    const locations = data?.locations || [];
    for (const location of locations) {
      if (!location?.coords) continue;
      // eslint-disable-next-line no-await-in-loop
      await appendLocationPoint(
        {
          t: location.timestamp,
          lat: location.coords.latitude,
          lon: location.coords.longitude,
          accuracyMeters: Number.isFinite(location.coords.accuracy) ? location.coords.accuracy : null,
        },
        LOCATION_RETENTION_MS,
      );
    }
    // Opportunistic: prune on every delivery rather than adding a separate
    // scheduled job just for cleanup — appendLocationPoint already prunes on
    // every call, this only matters on days with zero movement/updates.
    await pruneLocationPoints(LOCATION_RETENTION_MS);
  });
}
