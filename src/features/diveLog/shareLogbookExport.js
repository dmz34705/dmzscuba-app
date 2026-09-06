import { exportLogbookCsv, exportLogbookJson, exportLogbookUddf } from '../../lib/diveLog/storage';

export async function shareLogbookExport(kind, ids = null, detail = 'summary', backup = false) {
  let Sharing;
  let FileSystem;
  try {
    Sharing = require('expo-sharing');
    FileSystem = require('expo-file-system');
  } catch {
    throw new Error('File sharing is available in a full app build, not Expo Go.');
  }
  const content = kind === 'json' ? JSON.stringify(await exportLogbookJson(undefined, ids, { detail, backup }), null, 2)
    : kind === 'csv' ? await exportLogbookCsv(undefined, ids, { detail })
      : await exportLogbookUddf(undefined, ids, { detail });
  const extension = kind === 'json' ? 'json' : kind === 'csv' ? 'csv' : 'uddf';
  const mimeType = kind === 'json' ? 'application/json' : kind === 'csv' ? 'text/csv' : 'application/xml';
  const scope = ids?.length ? `${ids.length}-dives` : 'all-dives';
  const file = new FileSystem.File(FileSystem.Paths.cache, `dmz-scuba-${scope}-${Date.now()}.${extension}`);
  file.write(content);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: `Share DMZ Scuba ${detail} ${kind.toUpperCase()} export` });
}
