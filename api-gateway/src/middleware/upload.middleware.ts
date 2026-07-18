import multer from 'multer';
import path from 'path';
import { AppError } from './errorHandler';

// Whitelist of allowed extensions and matching mimetypes
const ALLOWED_MIME_TYPES = new Map<string, string[]>([
  // Documents
  ['.pdf', ['application/pdf']],
  ['.docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']],
  ['.pptx', ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint']],
  ['.xlsx', ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']],
  ['.csv', ['text/csv', 'application/csv', 'application/vnd.ms-excel']],
  ['.txt', ['text/plain']],
  ['.md', ['text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream']],
  ['.html', ['text/html']],
  
  // Images
  ['.png', ['image/png']],
  ['.jpeg', ['image/jpeg', 'image/jpg']],
  ['.jpg', ['image/jpeg', 'image/jpg']],
  ['.webp', ['image/webp']],
  ['.gif', ['image/gif']],
  ['.bmp', ['image/bmp', 'image/x-ms-bmp']],
  ['.heic', ['image/heic', 'image/heif', 'application/octet-stream']],
  
  // Videos
  ['.mp4', ['video/mp4']],
  ['.mov', ['video/quicktime']],
  ['.avi', ['video/x-msvideo', 'video/avi', 'application/x-troff-msvideo']],
  ['.mkv', ['video/x-matroska', 'video/mkv']],
  
  // Audios
  ['.mp3', ['audio/mpeg', 'audio/mp3']],
  ['.wav', ['audio/wav', 'audio/x-wav']],
  ['.aac', ['audio/aac', 'audio/x-aac', 'audio/mp4']],
]);

// Maximum file upload size limit (Default: 50MB)
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const storage = multer.memoryStorage();

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const fileExt = path.extname(file.originalname).toLowerCase();
  const fileMime = file.mimetype;

  const allowedMimes = ALLOWED_MIME_TYPES.get(fileExt);

  if (!allowedMimes) {
    return cb(new AppError(`Unsupported file extension: ${fileExt}`, 400));
  }

  if (!allowedMimes.includes(fileMime)) {
    // Sometimes Windows or browsers send generic mimetypes for custom files. 
    // We log a warning but permit if extension is explicitly mapped to common generic types.
    if (fileMime === 'application/octet-stream') {
      return cb(null, true);
    }
    return cb(new AppError(`Mime-type mismatch for ${fileExt}: received "${fileMime}"`, 400));
  }

  return cb(null, true);
};

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter,
}).single('file');
