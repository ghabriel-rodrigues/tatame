import { HttpException } from '@nestjs/common';

/**
 * Stable machine error codes (problem+json registry — backend ticket 04).
 * Clients branch on `status` + `code`, never on human text.
 */
export const ErrorCodes = {
  // authn (ticket 02)
  AUTH_INVALID_CREDENTIALS: 'auth.invalid_credentials',
  AUTH_UNAUTHENTICATED: 'auth.unauthenticated',
  AUTH_TOKEN_EXPIRED: 'auth.token_expired',
  AUTH_REFRESH_REUSED: 'auth.refresh_reused',
  AUTH_MFA_REQUIRED: 'auth.mfa_required',
  AUTH_MFA_INVALID_CODE: 'auth.mfa_invalid_code',
  INVITE_INVALID_OR_EXPIRED: 'invite.invalid_or_expired',
  INVITE_MINOR_REQUIRES_GUARDIAN: 'invite.minor_requires_guardian',
  INVITE_EMAIL_EXISTS: 'invite.email_exists',
  INVITE_ALREADY_MEMBER: 'invite.already_member',
  RESET_INVALID_OR_EXPIRED: 'reset.invalid_or_expired',
  // authz (ticket 03)
  AUTHZ_FORBIDDEN_ROLE: 'authz.forbidden_role',
  AUTHZ_PERMISSION_DISABLED: 'authz.permission_disabled',
  AUTHZ_IMPERSONATION_RESTRICTED: 'authz.impersonation_restricted',
  TENANT_SUSPENDED: 'tenant.suspended',
  TENANT_READ_ONLY: 'tenant.read_only',
  // enrollment (spec 003)
  CLASS_FULL: 'class.full',
  CLASS_ARCHIVED: 'class.archived',
  CLASS_CAPACITY_EXCEEDED: 'class.capacity_exceeded',
  ENROLLMENT_ALREADY_ENROLLED: 'enrollment.already_enrolled',
  // generic
  VALIDATION_FAILED: 'validation.failed',
  NOT_FOUND: 'resource.not_found',
  CONFLICT: 'resource.conflict',
  INTERNAL: 'internal.error',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  /** Field-level validation errors (422 only). */
  errors?: Array<{ field: string; messages: string[] }>;
}

/**
 * RFC 9457 problem exception — the only exception the identity module throws
 * on purpose. The global filter serializes it as `application/problem+json`.
 */
export class ProblemException extends HttpException {
  readonly code: string;
  readonly errors?: ProblemBody['errors'];

  constructor(
    status: number,
    code: string,
    detail?: string,
    errors?: ProblemBody['errors'],
  ) {
    super({ code, detail, errors }, status);
    this.code = code;
    this.errors = errors;
  }
}

export const problem = (
  status: number,
  code: string,
  detail?: string,
  errors?: ProblemBody['errors'],
) => new ProblemException(status, code, detail, errors);
