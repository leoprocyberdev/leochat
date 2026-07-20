// js/imgbb.js
const IMGBB_API_KEY = 'adb892389a0236cb4ca26b076fc30604';

/**
 * Client-side image compressor using HTML5 Canvas
 * @param {File} file - Original raw image file
 * @param {number} maxWidth - Max width bound (default: 1024px)
 * @param {number} maxHeight - Max height bound (default: 1024px)
 * @param {number} quality - Compression factor 0.0 to 1.0 (default: 0.7 for 70% JPEG quality)
 * @returns {Promise<Blob>} - Compressed Blob ready for upload
 */
function compressImage(file, maxWidth = 1024, maxHeight = 1024, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;

            img.onload = () => {
                let width = img.width;
                let height = img.height;

                // Calculate aspect ratio scaling
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                // Render to Canvas for compression
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Export as compressed JPEG Blob
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error("Canvas image compression failed."));
                        }
                    },
                    'image/jpeg',
                    quality
                );
            };

            img.onerror = (err) => reject(err);
        };

        reader.onerror = (err) => reject(err);
    });
}

/**
 * Compresses and uploads an image file to ImgBB API
 * @param {File} file - Raw image file from file picker
 * @returns {Promise<string>} - Direct URL of uploaded image
 */
export async function uploadImageToImgBB(file) {
    if (!file) throw new Error("No file selected.");

    try {
        // 1. Perform client-side compression (Reduces multi-MB photos down to ~100-300KB)
        const compressedBlob = await compressImage(file, 1024, 1024, 0.7);

        // 2. Wrap compressed blob into FormData
        const formData = new FormData();
        formData.append("image", compressedBlob, file.name || "compressed_upload.jpg");

        // 3. POST to ImgBB
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            return data.data.url;
        } else {
            throw new Error(data.error ? data.error.message : "ImgBB upload failed.");
        }
    } catch (error) {
        console.error("ImgBB Upload Error:", error);
        throw error;
    }
}
