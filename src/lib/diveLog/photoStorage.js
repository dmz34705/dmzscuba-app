// Durable on-device storage for logbook photos.
//
// ImagePicker is allowed to return a cache URI (or a photo-library URI), neither
// of which is a durable record of a photo selected for a dive.  Keep our own
// copy in documentDirectory instead. This directory survives app restarts and
// cache eviction, but is still private to this app and is removed on uninstall.

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export const DIVE_PHOTO_DIRECTORY = `${FileSystem.documentDirectory || ''}dive-photos/`;

function imageExtension(photo) {
  const mime = String(photo?.mimeType || '').toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function uniqueFilename(photo) {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `dive-photo-${Date.now()}-${suffix}.${imageExtension(photo)}`;
}

export function isManagedDivePhotoUri(uri) {
  return Boolean(DIVE_PHOTO_DIRECTORY && typeof uri === 'string' && uri.startsWith(DIVE_PHOTO_DIRECTORY));
}

/**
 * Copy a picker result into durable app storage and return a normal photo link.
 * Existing links deliberately retain their shape; only `uri` changes. This
 * keeps galleries, exports, sharing, duplicate detection, and old records
 * compatible. Web retains its browser-provided URL because documentDirectory
 * is a native-app concept and cannot persist a browser-selected file here.
 */
export async function persistDivePhoto(photo) {
  if (!photo?.uri || Platform.OS === 'web' || isManagedDivePhotoUri(photo.uri)) return photo;
  if (!DIVE_PHOTO_DIRECTORY) throw new Error('Persistent photo storage is unavailable on this device.');

  await FileSystem.makeDirectoryAsync(DIVE_PHOTO_DIRECTORY, { intermediates: true });
  const uri = `${DIVE_PHOTO_DIRECTORY}${uniqueFilename(photo)}`;
  try {
    await FileSystem.copyAsync({ from: photo.uri, to: uri });
    const copied = await FileSystem.getInfoAsync(uri);
    if (!copied.exists || copied.isDirectory) {
      throw new Error('The copied file is unavailable.');
    }
  } catch (error) {
    // Do not leave a partial file behind if a cloud-backed library asset could
    // not be read. The calling importer will retain its existing links and
    // show an actionable error instead of saving a broken new one.
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    throw new Error('The selected photo could not be saved for the logbook.');
  }
  return { ...photo, uri };
}

// Backfill an old link without changing its photo identity.  A picker/cache
// URI is tried first; if it expired, resolveAssetInfo can locate the original
// using the assetId retained in the logbook.
export async function repairDivePhoto(photo, resolveAssetInfo) {
  try {
    return await persistDivePhoto(photo);
  } catch (firstError) {
    if (!photo?.assetId || typeof resolveAssetInfo !== 'function') throw firstError;
    const info = await resolveAssetInfo(photo.assetId);
    const uri = info?.localUri || info?.uri;
    if (!uri) throw firstError;
    return persistDivePhoto({ ...photo, uri });
  }
}

/** Remove only app-owned copies. Camera-roll originals and legacy links stay untouched. */
export async function removeManagedDivePhoto(uri) {
  if (!isManagedDivePhotoUri(uri)) return;
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
}
