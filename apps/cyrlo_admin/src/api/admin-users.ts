import { apiRequest } from './client';
import type {
  AdminReinstateUserInput,
  AdminReinstateUserResult,
  AdminSuspendUserInput,
  AdminSuspendUserResult,
} from './types';

/** `POST /admin/users/suspend` — does not cancel active trips or change token balances. */
export function suspendUser(input: AdminSuspendUserInput): Promise<AdminSuspendUserResult> {
  return apiRequest<AdminSuspendUserResult>('/admin/users/suspend', {
    method: 'POST',
    body: input,
  });
}

/** `POST /admin/users/reinstate` — reason required; availability stays offline until rider goes online. */
export function reinstateUser(input: AdminReinstateUserInput): Promise<AdminReinstateUserResult> {
  return apiRequest<AdminReinstateUserResult>('/admin/users/reinstate', {
    method: 'POST',
    body: input,
  });
}
