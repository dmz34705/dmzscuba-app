import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { normalizeInsuranceState } from './model';

// Policies live on this device only (and in the development backups, which copy app storage and
// every file under Documents). Documents are copied into the app so they survive the original
// being deleted from Files or Photos.
export const INSURANCE_STORAGE_KEY = '@dmz-scuba/insurance/v1';
export const INSURANCE_DOCUMENT_DIRECTORY = `${FileSystem.documentDirectory || ''}insurance-documents/`;

export async function loadInsuranceState(storage = AsyncStorage) {
  try {
    const raw = await storage.getItem(INSURANCE_STORAGE_KEY);
    return normalizeInsuranceState(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeInsuranceState(null);
  }
}

export async function saveInsuranceState(state, storage = AsyncStorage) {
  const normalized = normalizeInsuranceState(state);
  await storage.setItem(INSURANCE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export const isManagedInsuranceDocument = (uri) => Boolean(INSURANCE_DOCUMENT_DIRECTORY && typeof uri === 'string' && uri.startsWith(INSURANCE_DOCUMENT_DIRECTORY));

function extension(document) {
  const fromName = String(document?.name || '').match(/\.([a-zA-Z0-9]{1,8})$/)?.[1];
  if (fromName) return fromName.toLowerCase();
  const mime = String(document?.mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
  return document?.kind === 'photo' ? 'jpg' : 'file';
}

export async function persistInsuranceDocument(document, policyId) {
  if (!document?.uri || Platform.OS === 'web' || isManagedInsuranceDocument(document.uri)) return document;
  if (!INSURANCE_DOCUMENT_DIRECTORY) throw new Error('Document storage is unavailable on this device.');
  const folder = `${INSURANCE_DOCUMENT_DIRECTORY}${policyId}/`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  const uri = `${folder}${document.id}-${Date.now()}.${extension(document)}`;
  try {
    await FileSystem.copyAsync({ from: document.uri, to: uri });
    const copied = await FileSystem.getInfoAsync(uri);
    if (!copied.exists || copied.isDirectory) throw new Error('missing');
    return { ...document, uri };
  } catch {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    throw new Error(`Could not save ${document.name || 'that document'} on this device.`);
  }
}

export async function removeInsuranceDocument(uri) {
  if (isManagedInsuranceDocument(uri)) await FileSystem.deleteAsync(uri, { idempotent: true });
}
