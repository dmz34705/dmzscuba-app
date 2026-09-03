import { useCallback, useEffect, useState } from 'react';

import * as downloadService from './downloadService';

// Thin subscription to the module-level download engine. The transfer lives in
// `downloadService` (not here), so it keeps running when this component — or the
// whole logbook screen — unmounts. Multiple components can call this hook; they
// all read the same singleton.
export default function useDiveComputerDownload() {
  const [snapshot, setSnapshot] = useState(downloadService.getState);

  useEffect(() => {
    setSnapshot(downloadService.getState());
    return downloadService.subscribe(setSnapshot);
  }, []);

  const clearLog = useCallback(() => downloadService.clearLog(), []);

  return {
    supported: snapshot.supported,
    status: snapshot.status,
    devices: snapshot.devices,
    connectedDevice: snapshot.connectedDevice,
    progress: snapshot.progress,
    summary: snapshot.summary,
    error: snapshot.error,
    log: snapshot.log,
    scan: downloadService.scan,
    stopScan: downloadService.stopScan,
    connect: downloadService.connect,
    disconnect: downloadService.disconnect,
    download: downloadService.download,
    cancel: downloadService.cancel,
    reset: downloadService.reset,
    clearLog,
  };
}
