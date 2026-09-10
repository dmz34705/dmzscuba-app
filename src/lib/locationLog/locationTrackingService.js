// Starts/stops the background location breadcrumb log and handles the
// permission dance. The actual point storage lives in backgroundTask.js's
// TaskManager callback — this module is the control surface the Settings
// toggle drives.

import { LOCATION_RETENTION_MS, LOCATION_TASK_NAME } from './backgroundTask';
import { appendLocationPoint, loadLocationPoints } from './storage';

// Both expo-location and expo-task-manager eagerly call requireNativeModule()
// the moment they're imported — not just when a function runs — so a build
// that predates this feature throws synchronously on a plain `import`. This
// file is reached via a static import chain (SettingsScreen -> here) that
// Metro bundles eagerly regardless of whether Settings ever renders, so an
// uncaught throw here is exactly as fatal to app boot as the same mistake
// in backgroundTask.js. require() inside try/catch, same pattern
// diveComputerBle.js already uses for react-native-ble-plx.
let Location = null;
let TaskManager = null;
try {
  // eslint-disable-next-line global-require
  Location = require('expo-location');
  // eslint-disable-next-line global-require
  TaskManager = require('expo-task-manager');
} catch {
  Location = null;
  TaskManager = null;
}

// A breadcrumb log for "which dive site was I near", not a fitness GPS
// trail: coarse accuracy and a wide distance/time gate keep this cheap on
// battery. A boat ride to a dive site or a drive to a new shore entry (both
// well over 750m) still reliably produces a point; sitting at a dock for an
// hour between dives does not spam the log.
function trackingOptions() {
  return {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 250, // meters — retain a breadcrumb on arrival at a quarry
    timeInterval: 20 * 60 * 1000, // ms — Android only, iOS paces off distance/activity instead
    pausesUpdatesAutomatically: false, // keep delivery eligible during stationary shore dives
    showsBackgroundLocationIndicator: false,
    activityType: Location.ActivityType.Other,
    foregroundService: {
      notificationTitle: 'DMZ Scuba',
      notificationBody: 'Logging coarse location to suggest dive site locations later.',
    },
  };
}

/** False in Expo Go / web, or if this build predates the native module being linked. */
export async function isLocationTrackingAvailable() {
  if (!Location || !TaskManager) return false;
  try {
    const [taskManagerAvailable, backgroundLocationAvailable] = await Promise.all([
      TaskManager.isAvailableAsync(),
      Location.isBackgroundLocationAvailableAsync(),
    ]);
    return taskManagerAvailable && backgroundLocationAvailable;
  } catch {
    return false;
  }
}

export async function isLocationTrackingRunning() {
  if (!Location) return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

function permissionLabel(foreground, background) {
  if (background?.status === 'granted') return 'granted';
  if (foreground?.status === 'granted') return 'foreground-only';
  return 'denied';
}

/** Read the real native state without displaying a permission prompt. */
export async function getLocationTrackingStatus() {
  const available = await isLocationTrackingAvailable();
  if (!available || !Location) {
    return { available: false, running: false, permission: 'unavailable', servicesEnabled: false };
  }
  try {
    const [foreground, background, running, servicesEnabled] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
      isLocationTrackingRunning(),
      Location.hasServicesEnabledAsync(),
    ]);
    return {
      available: true,
      running,
      permission: permissionLabel(foreground, background),
      servicesEnabled,
    };
  } catch {
    return { available: true, running: false, permission: 'denied', servicesEnabled: false };
  }
}

/**
 * Restore an opted-in background task after an app/client rebuild. This never
 * asks for new permission: it only restarts when the user has already granted
 * background access.
 */
export async function ensureLocationTracking() {
  const status = await getLocationTrackingStatus();
  if (!status.available || status.permission !== 'granted' || !status.servicesEnabled) {
    return { ...status, started: status.running };
  }
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, trackingOptions());
    return { ...status, running: true, started: true };
  } catch {
    return { ...status, running: false, started: false };
  }
}

/**
 * Record a foreground breadcrumb while the user is actively downloading.
 * This covers the common case where iOS paused background delivery at a dock,
 * while the one-hour correlation window still prevents a later point at home
 * from being attached to an old dive.
 */
export async function captureCurrentLocationBreadcrumb() {
  if (!Location) return null;
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') return null;
    let timer;
    const location = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), 12000); }),
    ]).finally(() => clearTimeout(timer));
    if (!location?.coords) return null;
    const point = {
      t: Number.isFinite(location.timestamp) ? location.timestamp : Date.now(),
      lat: location.coords.latitude,
      lon: location.coords.longitude,
      accuracyMeters: Number.isFinite(location.coords.accuracy) ? location.coords.accuracy : null,
    };
    await appendLocationPoint(point, LOCATION_RETENTION_MS);
    return point;
  } catch {
    return null;
  }
}

/** Evidence of recorded points, rather than only task registration status. */
export async function getLocationRecordingSummary() {
  const [status, points] = await Promise.all([getLocationTrackingStatus(), loadLocationPoints()]);
  const latest = points.reduce((value, point) => Math.max(value, point.t || 0), 0);
  return {
    ...status,
    pointCount: points.length,
    lastRecordedAt: latest ? new Date(latest).toISOString() : null,
  };
}

/**
 * Requests foreground access first, then background — Apple's own guidance,
 * and in practice the two-step ask reads as far less alarming to a user than
 * a single upfront request for "Always" access.
 * @returns {Promise<'granted'|'foreground-only'|'denied'>}
 */
export async function requestLocationPermissions() {
  if (!Location) return 'denied';
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return 'denied';
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === 'granted' ? 'granted' : 'foreground-only';
}

/** @returns {Promise<{started: boolean, permission: 'granted'|'foreground-only'|'denied'}>} */
export async function startLocationTracking() {
  if (!Location) return { started: false, permission: 'denied' };
  const permission = await requestLocationPermissions();
  if (permission !== 'granted') return { started: false, permission };
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, trackingOptions());
    return { started: true, permission };
  } catch {
    return { started: false, permission };
  }
}

export async function stopLocationTracking() {
  if (!Location) return;
  try {
    if (await isLocationTrackingRunning()) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch {
    // already stopped, or the task was never registered — nothing to do
  }
}
