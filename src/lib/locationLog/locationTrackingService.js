// Starts/stops the background location breadcrumb log and handles the
// permission dance. The actual point storage lives in backgroundTask.js's
// TaskManager callback — this module is the control surface the Settings
// toggle drives.

import { LOCATION_TASK_NAME } from './backgroundTask';

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
    distanceInterval: 750, // meters
    timeInterval: 20 * 60 * 1000, // ms — Android only, iOS paces off distance/activity instead
    pausesUpdatesAutomatically: true, // iOS: let the system idle the radio when stationary
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
    return await TaskManager.isAvailableAsync();
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
