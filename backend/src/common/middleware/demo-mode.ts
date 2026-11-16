import type { RequestHandler } from 'express';

import { env } from '../../config/env.js';

/**
 * Marks investor Demo Mode on the request when:
 * - server allows it (`DEMO_MODE=1`), and
 * - client sends `X-Cyrlo-Demo: 1`.
 *
 * Production should keep DEMO_MODE unset/false so the header is ignored.
 */
export const attachDemoFlag: RequestHandler = (req, _res, next) => {
  const header = (req.header('x-cyrlo-demo') ?? '').trim();
  req.demo = env.DEMO_MODE && (header === '1' || header.toLowerCase() === 'true');
  next();
};

export function isDemoRequest(req: { demo?: boolean }): boolean {
  return req.demo === true;
}
