import multer from 'multer';

import { AppError } from '../errors/app-error.js';
import { MAX_DOCUMENT_BYTES } from '../../infrastructure/storage/object-storage.js';

export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
    if (!allowed.has(file.mimetype)) {
      callback(
        new AppError({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Unsupported document type',
        }),
      );
      return;
    }
    callback(null, true);
  },
});
