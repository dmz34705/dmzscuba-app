// Shared identity keys for camera-roll assets and persisted photo links.
export function photoIdentityKeys(photo) {
  if (!photo || typeof photo !== 'object') return [];
  return [photo.assetId, photo.id, photo.uri]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .map((value) => `photo:${value}`);
}

export function dedupePhotoAssets(assets, existingPhotos = []) {
  const seen = new Set(existingPhotos.flatMap(photoIdentityKeys));
  const unique = [];
  let skipped = 0;
  for (const asset of Array.isArray(assets) ? assets : []) {
    const keys = photoIdentityKeys(asset);
    if (!keys.length || keys.some((key) => seen.has(key))) {
      skipped += 1;
      continue;
    }
    keys.forEach((key) => seen.add(key));
    unique.push(asset);
  }
  return { assets: unique, skipped };
}
