"use client";

/**
 * Re-encodes an athlete's photo to strip embedded metadata before upload.
 *
 * Camera and phone images routinely carry EXIF, and EXIF routinely carries GPS
 * coordinates. Athlesite profiles are public and largely belong to minors, so a
 * photo must not ship the location it was taken. Decoding to pixels and
 * re-encoding discards EXIF, XMP, and IPTC by construction — there is no path
 * for metadata to survive, which is why no parsing library is needed.
 *
 * This runs in the browser, so the original bytes never leave the athlete's
 * device. That is stronger than stripping server-side, which would require
 * transmitting and storing the coordinates first.
 *
 * It is a product guarantee, not an enforced invariant: an athlete's session can
 * write to their own Storage folder, so a determined user could bypass the app
 * and upload an untouched file. The threat model is accidental self-disclosure,
 * not deliberate self-exposure. See docs/ai/DECISIONS.md § Media & Storage.
 */

/**
 * Longest edge of a stored photo. Beyond serving smaller files, this keeps every
 * image inside the browser's canvas area limits — Safari's is the tightest, and
 * an ordinary 48-megapixel phone photo would otherwise fail to decode at all.
 */
const MAX_IMAGE_EDGE = 2400;

/** Applies to JPEG and WebP encoding. PNG is lossless and ignores it. */
const JPEG_QUALITY = 0.92;

/** Formats the bucket accepts. An encoder fallback outside this set is a failure. */
const ENCODABLE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type ProcessedImage =
  | { ok: true; file: File }
  | { ok: false; message: string };

/** Scaled dimensions that fit within MAX_IMAGE_EDGE. Never enlarges. */
function fitWithinMaxEdge(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_IMAGE_EDGE) return { width, height };
  const scale = MAX_IMAGE_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Promise wrapper around the callback-based HTMLCanvasElement.toBlob. */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  type: string
): Promise<Blob | null> {
  // Alpha is left enabled so PNG and WebP transparency survives the round trip.
  // A JPEG has no alpha to begin with, so its canvas is fully opaque anyway.
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type, quality: JPEG_QUALITY });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvasToBlob(canvas, type, JPEG_QUALITY);
}

/**
 * Strips metadata from `file` and returns a new File of the same format.
 *
 * Orientation is baked into the pixels before the metadata is discarded.
 * `imageOrientation: "from-image"` is passed explicitly rather than relying on
 * the default, which has differed across browsers and spec revisions. Without
 * it, removing EXIF would leave a portrait phone photo displaying on its side:
 * the browser had been rotating it at render time using the very tag we remove.
 */
export async function stripImageMetadata(file: File): Promise<ProcessedImage> {
  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return {
      ok: false,
      message: "Couldn't read that photo. Try a different image.",
    };
  }

  try {
    const { width, height } = fitWithinMaxEdge(bitmap.width, bitmap.height);
    const blob = await encode(bitmap, width, height, file.type);

    if (!blob) {
      return { ok: false, message: "Couldn't process that photo. Try a different image." };
    }

    // A browser that cannot encode the requested format silently substitutes
    // another — historically PNG. Accept it when the bucket allows it: the
    // metadata is still gone, transparency is intact, and the object's
    // extension and contentType both follow the real bytes. Anything else is a
    // failure rather than a surprise upload.
    if (!ENCODABLE_TYPES.includes(blob.type)) {
      return { ok: false, message: "Couldn't process that photo. Try a JPG or PNG." };
    }

    return {
      ok: true,
      file: new File([blob], file.name, { type: blob.type, lastModified: Date.now() }),
    };
  } catch {
    return { ok: false, message: "Couldn't process that photo. Try a different image." };
  } finally {
    bitmap.close();
  }
}
