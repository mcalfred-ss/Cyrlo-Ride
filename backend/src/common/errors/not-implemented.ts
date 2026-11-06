import { AppError } from './app-error.js';

export function notImplemented(feature: string): never {
  throw new AppError({
    status: 501,
    code: 'NOT_IMPLEMENTED',
    message: `${feature} is part of the module contract and is not implemented yet`,
  });
}
