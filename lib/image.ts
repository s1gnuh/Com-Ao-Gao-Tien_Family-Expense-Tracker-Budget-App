const MAX_EDGE = 1600;
const QUALITY = 0.8;

/**
 * iPhone camera shots run 3-6MB, over the serverless body cap, and cost more
 * Gemini tokens than a receipt needs. Re-encode to a bounded JPEG first — this
 * also sidesteps HEIC reaching the API, since canvas always emits JPEG.
 */
export async function downscaleImage(file: File): Promise<Blob> {
  const bitmap = await decode(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.drawImage(bitmap, 0, 0, width, height);
  if ('close' in bitmap) bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  );
  if (!blob) throw new Error('Encode failed');
  return blob;
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Safari refuses createImageBitmap on some HEIC files but decodes them in <img>.
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
