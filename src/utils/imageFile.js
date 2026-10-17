// Image uploads: every image format is accepted — the backend re-encodes
// each upload to JPG / PNG / WebP (Backend/utils/cloudinaryUploader.js).
// Mirrors the extension list in Backend/middlewares/uploadMiddleware.js.

const IMAGE_EXTENSIONS = [
    'jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'png', 'webp', 'gif', 'bmp',
    'tif', 'tiff', 'svg', 'heic', 'heif', 'avif', 'ico',
];

// For <input type="file" accept=…>. "image/*" alone hides .heic / .heif
// files in the Windows file picker, so they are listed explicitly.
export const IMAGE_ACCEPT = 'image/*,.heic,.heif';

/** True for any image file. Windows browsers report HEIC/HEIF photos with
 *  an empty type, so the extension decides when the type is missing. */
export function isImageFile(file) {
    if (!file) return false;
    const ext = String(file.name || '').split('.').pop().toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) return false;
    const type = String(file.type || '').toLowerCase();
    return type === '' || type === 'application/octet-stream' || type.startsWith('image/');
}
