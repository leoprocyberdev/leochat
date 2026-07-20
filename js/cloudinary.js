// Cloudinary Configuration
const CLOUDINARY_CONFIG = {
  cloudName: 'daviwxcrw',
  apiKey: '846849687286564',
  uploadPreset: 'leochat'
};

/**
 * Uploads a file (audio/voice note, image, etc.) to Cloudinary with compression parameters
 * @param {Blob|File} file - The file or blob to upload
 * @returns {Promise<string>} - Resolves with the secure URL of the uploaded file
 */
export async function uploadVoiceNoteToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
  formData.append('api_key', CLOUDINARY_CONFIG.apiKey);

  // Audio Compression Settings (reduces voice note file size)
  formData.append('audio_codec', 'mp3'); 
  formData.append('bit_rate', '64k');   

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/auto/upload`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to upload to Cloudinary');
    }

    return data.secure_url;
  } catch (error) {
    console.error('Cloudinary Upload Error:', error);
    throw error;
  }
}
