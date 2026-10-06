import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { activateAtlasDatasets } from './datasets';
import { createAtlasUpdater } from './updateEngine';
import { utf8Bytes } from './updateContract';

// Set EXPO_PUBLIC_ATLAS_ORIGIN=https://dmzscuba-com.pages.dev for development releases.
// Production never silently falls back to a development endpoint.
export const ATLAS_ORIGIN = (process.env.EXPO_PUBLIC_ATLAS_ORIGIN || 'https://www.dmzscuba.com').replace(/\/$/, '');
// Development and production downloads have independent active/rollback state.
const STATE_KEY = `@dmz-scuba/ocean-atlas/releases-v1/${ATLAS_ORIGIN}`;
const sourceFolder = ATLAS_ORIGIN.replace(/[^a-z0-9.-]/gi, '_');
const directory = () => new Directory(Paths.document, 'ocean-atlas', sourceFolder, 'files');
const listeners = new Set();
let status = { source: 'bundled', phase: 'idle', version: null, publishedAt: null, checkedAt: null };
export const atlasUpdateStatus = () => status;
export const onAtlasUpdateStatus = listener => { listeners.add(listener); return () => listeners.delete(listener); };

const storage = {
  readState: async () => JSON.parse(await AsyncStorage.getItem(STATE_KEY) || 'null'),
  writeState: state => AsyncStorage.setItem(STATE_KEY, JSON.stringify(state)),
  readFile: async name => {
    const file = new File(directory(), name);
    return file.exists ? file.text() : null;
  },
  writeFile: async (name, text) => {
    const dir = directory();
    dir.create({ intermediates: true, idempotent: true });
    const temporary = new File(dir, `${name}.tmp`), destination = new File(dir, name);
    temporary.create({ overwrite: true });
    temporary.write(text);
    await temporary.move(destination, { overwrite: true });
  },
  prune: async keep => {
    const dir = directory();
    if (!dir.exists) return;
    for (const entry of dir.list()) if (entry instanceof File && !keep.has(entry.name)) entry.delete();
  },
};

async function fetchText(url, maxBytes) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
    if (!response.ok) throw new Error(`Atlas server returned ${response.status}.`);
    const length = response.headers.get('content-length');
    if (length && Number(length) > maxBytes) throw new Error('Atlas download is too large.');
    const text = await response.text();
    if (utf8Bytes(text) > maxBytes) throw new Error('Atlas download is too large.');
    return text;
  } finally { clearTimeout(timer); }
}

export const atlasUpdater = createAtlasUpdater({
  storage, fetchText, baseUrl: ATLAS_ORIGIN,
  digest: text => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text),
  activate: activateAtlasDatasets,
  onStatus: value => { status = value; for (const listener of listeners) listener(); },
});

export function atlasStatusLabel(value) {
  const date = value.publishedAt ? new Date(value.publishedAt).toLocaleDateString() : null;
  if (value.phase === 'checking') return 'Checking Atlas updates…';
  if (value.phase === 'downloading') return 'Updating Atlas…';
  if (value.phase === 'unavailable') return date ? `Using saved Atlas · ${date}` : 'Using included Atlas';
  return date ? `Atlas updated ${date}` : 'Included Atlas data';
}
