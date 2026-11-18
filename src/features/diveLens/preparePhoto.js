// Read decoded dimensions: saved logbook photos don't carry picker metadata.
// Keep the original URI/metadata for linking; only the analysis copy is reduced.
export const MAX_LENS_IMAGE_CHARS = 2000000;

export async function prepareLensPhoto(asset, manipulator) {
  if (!asset?.uri) throw new Error('Choose a photo to identify.');
  const context = manipulator.ImageManipulator.manipulate(asset.uri);
  const images = new Set();
  try {
    const original = await context.renderAsync();
    images.add(original);
    if (!(original.width > 0 && original.height > 0)) throw new Error('This photo could not be opened. Try another photo.');
    for (const [edge, quality] of [[1280, 0.7], [960, 0.6]]) {
      context.reset();
      const longest = Math.max(original.width, original.height);
      if (longest > edge) context.resize(original.width >= original.height ? { width: edge } : { height: edge });
      const image = await context.renderAsync();
      images.add(image);
      const prepared = await image.saveAsync({ format: manipulator.SaveFormat.JPEG, compress: quality, base64: true });
      if (prepared.base64 && prepared.base64.length <= MAX_LENS_IMAGE_CHARS) {
        return { ...asset, base64: prepared.base64, mimeType: 'image/jpeg' };
      }
    }
    throw new Error('This photo could not be reduced for identification. Try a smaller photo.');
  } finally {
    for (const image of images) image.release();
    context.release();
  }
}
