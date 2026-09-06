import { useEffect } from 'react';

// Native modules are compiled into development clients. Keep older installed
// clients usable until they are rebuilt with ExpoScreenOrientation included.
let screenOrientation = null;
try {
  screenOrientation = require('expo-screen-orientation');
} catch {}

export { screenOrientation };

export function usePortraitOrientation() {
  useEffect(() => {
    screenOrientation?.lockAsync(screenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);
}
