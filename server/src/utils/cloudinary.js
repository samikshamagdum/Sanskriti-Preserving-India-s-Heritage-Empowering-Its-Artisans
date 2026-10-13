const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || ''
});

function isConfigured() {
  return !!(cloudinary.config().cloud_name && cloudinary.config().api_key && cloudinary.config().api_secret);
}

// Upload a buffer to Cloudinary. Returns { url, publicId }.
async function uploadBuffer(buffer, { folder = 'sanskriti', resource_type = 'auto', public_id } = {}) {
  if (!isConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type, public_id },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id, sizeBytes: result.bytes, format: result.format });
      }
    );
    stream.end(buffer);
  });
}

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_AUDIO = ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/m4a'];
const ALLOWED_VIDEO = ['video/mp4', 'video/webm', 'video/quicktime'];
const MAX_IMAGE = 8 * 1024 * 1024; // 8 MB
const MAX_AUDIO = 20 * 1024 * 1024; // 20 MB
const MAX_VIDEO = 50 * 1024 * 1024; // 50 MB

function validateImage(mimetype, size) {
  if (!ALLOWED_IMAGE.includes(mimetype)) throw new Error('Only JPG, PNG, WEBP or GIF images are allowed');
  if (size > MAX_IMAGE) throw new Error('Image must be smaller than 8 MB');
}

function validateAudio(mimetype, size) {
  if (!ALLOWED_AUDIO.includes(mimetype)) throw new Error('Unsupported audio format');
  if (size > MAX_AUDIO) throw new Error('Audio must be smaller than 20 MB');
}

function validateVideo(mimetype, size) {
  if (!ALLOWED_VIDEO.includes(mimetype)) throw new Error('Unsupported video format');
  if (size > MAX_VIDEO) throw new Error('Video must be smaller than 50 MB');
}

module.exports = {
  isConfigured,
  uploadBuffer,
  validateImage,
  validateAudio,
  validateVideo,
  MAX_IMAGE, MAX_AUDIO, MAX_VIDEO
};