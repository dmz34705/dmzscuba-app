import { useEffect, useSyncExternalStore } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';
import { atlasGeneration, onAtlasDataChange } from './datasets';
import { atlasUpdater, atlasUpdateStatus, onAtlasUpdateStatus } from './updates';

export function useAtlasSnapshot() {
  return useSyncExternalStore(onAtlasDataChange, atlasGeneration, atlasGeneration);
}
export function useAtlasStatus() {
  return useSyncExternalStore(onAtlasUpdateStatus, atlasUpdateStatus, atlasUpdateStatus);
}

// One app-wide owner. A network signal triggers a real server request; it is not
// treated as proof the website is reachable. Retry outages while foregrounded.
export default function useAtlasUpdates() {
  useEffect(() => {
    // Unknown connectivity still permits real requests. Older development clients
    // may not contain NetInfo yet; never import its throwing native interface there.
    let connected = null, active = AppState.currentState !== 'background', mounted = true;
    const check = () => { if (mounted && active) atlasUpdater.checkForUpdates(); };
    atlasUpdater.initialize().then(check);
    let unsubscribe = () => {};
    if (Platform.OS === 'web' || NativeModules.RNCNetInfo) {
      const NetInfo = require('@react-native-community/netinfo').default;
      unsubscribe = NetInfo.addEventListener(state => {
        const online = state.isConnected === false || state.isInternetReachable === false
          ? false : state.isConnected === true ? true : null;
        if (online === true && connected !== true) check();
        connected = online;
      });
    }
    const app = AppState.addEventListener('change', state => {
      const wasActive = active;
      active = state === 'active';
      if (active && !wasActive) check();
    });
    const retry = setInterval(() => { if (connected !== false && atlasUpdateStatus().phase === 'unavailable') check(); }, 60000);
    return () => { mounted = false; unsubscribe(); app.remove(); clearInterval(retry); };
  }, []);
}
