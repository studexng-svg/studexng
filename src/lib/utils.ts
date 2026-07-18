import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Downscales/re-encodes an image client-side before upload. Modern phone
 * cameras (especially high-megapixel Android sensors) routinely produce
 * 15-40MB photos, which can fail to decode/preview or upload reliably on
 * memory-constrained devices. Falls back to the original file on any error
 * (unsupported format, decode failure, etc.) so it never blocks an upload —
 * worst case, the user just gets the original, un-shrunk file like before.
 */
export async function compressImage(file: File, maxDimension = 1600, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image failed to decode"));
      el.src = objectUrl!;
    });

    const { width, height } = img;
    const scale = Math.min(1, maxDimension / Math.max(width, height));

    // Already a small, universally-supported file — skip re-encoding.
    if (scale === 1 && (file.type === "image/jpeg" || file.type === "image/png")) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
