import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { normalizeGearState } from './model';

export const GEAR_STORAGE_KEY = '@dmz-scuba/gear-checklist/v1';
export const GEAR_ATTACHMENT_DIRECTORY = `${FileSystem.documentDirectory || ''}gear-attachments/`;

export async function loadGearState(storage = AsyncStorage) {
  try {
    const raw = await storage.getItem(GEAR_STORAGE_KEY);
    return normalizeGearState(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeGearState(null);
  }
}

export async function saveGearState(state, storage = AsyncStorage) {
  const normalized = normalizeGearState(state);
  await storage.setItem(GEAR_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function isManagedGearAttachment(uri) {
  return Boolean(GEAR_ATTACHMENT_DIRECTORY && typeof uri === 'string' && uri.startsWith(GEAR_ATTACHMENT_DIRECTORY));
}

function safeExtension(attachment) {
  const fromName = String(attachment?.name || '').match(/\.([a-zA-Z0-9]{1,8})$/)?.[1];
  if (fromName) return fromName.toLowerCase();
  const mime = String(attachment?.mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
  return attachment?.kind === 'photo' ? 'jpg' : 'file';
}

export async function persistGearAttachment(attachment, itemId) {
  if (!attachment?.uri || Platform.OS === 'web' || isManagedGearAttachment(attachment.uri)) return attachment;
  if (!GEAR_ATTACHMENT_DIRECTORY) throw new Error('Persistent gear-document storage is unavailable on this device.');
  const itemDirectory = `${GEAR_ATTACHMENT_DIRECTORY}${itemId}/`;
  await FileSystem.makeDirectoryAsync(itemDirectory, { intermediates: true });
  const uri = `${itemDirectory}${attachment.id}-${Date.now()}.${safeExtension(attachment)}`;
  try {
    await FileSystem.copyAsync({ from: attachment.uri, to: uri });
    const copied = await FileSystem.getInfoAsync(uri);
    if (!copied.exists || copied.isDirectory) throw new Error('The copied attachment is unavailable.');
    return { ...attachment, uri };
  } catch (error) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    throw new Error(`Could not save ${attachment.name || 'the selected attachment'} on this device.`);
  }
}

export async function removeManagedGearAttachment(uri) {
  if (!isManagedGearAttachment(uri)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function removeGearItemFiles(item) {
  await Promise.all((item?.attachments || []).map((attachment) => removeManagedGearAttachment(attachment.uri).catch(() => {})));
}
