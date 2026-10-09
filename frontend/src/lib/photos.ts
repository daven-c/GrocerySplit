export const MAX_PHOTOS = 3;

/** Shrink a phone photo before uploading: longest side 1600px, JPEG. Falls back to the original if the browser can't. */
export async function shrinkPhoto(file: File, maxSide = 1600): Promise<Blob> {
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.82));
        if (blob && blob.size < file.size) return blob;
    } catch { /* use the original */ }
    return file;
}
