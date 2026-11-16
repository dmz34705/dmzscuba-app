import { useEffect, useState } from 'react';

import { recoverPortableRestore } from '../lib/portableBackup';

// Finishes an interrupted backup restore before any screen or account sync
// reads app data, so nothing ever sees (or uploads) a half-restored state.
export default function RestoreRecoveryGate({ children }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    recoverPortableRestore().catch(() => {}).finally(() => setReady(true));
  }, []);
  return ready ? children : null;
}
