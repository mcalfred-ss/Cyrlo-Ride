import { Router } from 'express';

import type { WalletController } from './module.controller.js';

/** Planned HTTP routes stay unregistered until the feature is implemented. */
export function createWalletRouter(_controller: WalletController): Router {
  return Router();
}
