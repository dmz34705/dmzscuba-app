import { useEffect, useRef, useState } from 'react';

// expo-location is linked into the app already (dive-site breadcrumb log), so
// watchHeadingAsync works without a rebuild. expo-sensors was just added and
// only exists after `npx expo run:ios` — require() both defensively, the same
// pattern src/lib/locationLog/locationTrackingService.js uses.
let Location = null;
try {
  // eslint-disable-next-line global-require
  Location = require('expo-location');
} catch {
  Location = null;
}
let Sensors = null;
try {
  // eslint-disable-next-line global-require
  Sensors = require('expo-sensors');
} catch {
  Sensors = null;
}

const LOCK_TILT_DEG = 18;
const norm = (d) => ((d % 360) + 360) % 360;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Live compass state for the navigation lesson.
 * @param {{ manual?: boolean }} opts  manual = drag/slider mode (simulator, or a
 *   phone with no magnetometer).
 * @returns {{
 *   heading: number, tilt: number, tiltVec: {x:number,y:number}, locked: boolean,
 *   available: { heading: boolean, tilt: boolean },
 *   setManualHeading: (d:number)=>void, setManualTilt: (deg:number)=>void,
 * }}
 */
export default function useCompassHeading({ manual = false } = {}) {
  const [sensorHeading, setSensorHeading] = useState(null);
  const [tilt, setTilt] = useState(0);
  const [tiltVec, setTiltVec] = useState({ x: 0, y: 0 });
  const [manualHeading, setManualHeadingState] = useState(0);
  const [manualTilt, setManualTilt] = useState(0);
  const [available, setAvailable] = useState({ heading: false, tilt: false });
  const frozenHeading = useRef(0);

  // --- magnetometer heading (expo-location) ---
  useEffect(() => {
    if (manual || !Location?.watchHeadingAsync) return undefined;
    let sub = null;
    let cancelled = false;
    let lastPush = 0;
    (async () => {
      try {
        sub = await Location.watchHeadingAsync((h) => {
          if (cancelled) return;
          const now = Date.now();
          if (now - lastPush < 80) return; // ~12 Hz to state
          lastPush = now;
          const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          if (typeof deg === 'number' && !Number.isNaN(deg)) {
            setSensorHeading(norm(deg));
            setAvailable((a) => (a.heading ? a : { ...a, heading: true }));
          }
        });
      } catch {
        // no compass on this platform — screen falls back to manual mode
      }
    })();
    return () => { cancelled = true; sub?.remove?.(); };
  }, [manual]);

  // --- tilt from level (expo-sensors accelerometer / gravity vector) ---
  useEffect(() => {
    if (manual || !Sensors?.Accelerometer?.addListener) return undefined;
    let got = false;
    try {
      Sensors.Accelerometer.setUpdateInterval(100);
    } catch {
      return undefined;
    }
    const sub = Sensors.Accelerometer.addListener(({ x, y, z }) => {
      const mag = Math.hypot(x, y, z) || 1;
      setTilt(Math.acos(clamp(Math.abs(z) / mag, 0, 1)) * (180 / Math.PI));
      setTiltVec({ x: clamp(x / mag, -1, 1), y: clamp(y / mag, -1, 1) });
      if (!got) { got = true; setAvailable((a) => ({ ...a, tilt: true })); }
    });
    return () => sub?.remove?.();
  }, [manual]);

  const effTilt = manual ? manualTilt : tilt;
  const locked = effTilt > LOCK_TILT_DEG;

  let heading;
  if (manual) {
    heading = manualHeading;
  } else if (locked) {
    heading = frozenHeading.current; // a canted card binds — freeze the reading
  } else {
    heading = sensorHeading ?? 0;
    frozenHeading.current = heading;
  }

  return {
    heading: norm(heading),
    tilt: effTilt,
    tiltVec: manual ? { x: 0, y: -manualTilt / 45 } : tiltVec,
    locked,
    available: manual ? { heading: true, tilt: true } : available,
    setManualHeading: (d) => setManualHeadingState(norm(d)),
    setManualTilt,
  };
}
