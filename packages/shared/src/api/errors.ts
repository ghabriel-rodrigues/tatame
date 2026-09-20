/**
 * problem+json normalization (web-03). The API's only intentional error shape
 * is RFC 9457 `application/problem+json` with a stable machine `code`
 * (`apps/api/src/common/problem.ts`); clients branch on `status` + `code`,
 * never on human text. openapi-fetch parses non-2xx JSON bodies into `error`
 * as `unknown` — these helpers narrow that into a typed problem.
 */

/** Client-side mirror of the API's stable error-code registry. */
export const ApiErrorCodes = {
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
  AUTHZ_FORBIDDEN_ROLE: 'authz.forbidden_role',
  AUTHZ_PERMISSION_DISABLED: 'authz.permission_disabled',
  AUTHZ_IMPERSONATION_RESTRICTED: 'authz.impersonation_restricted',
  TENANT_SUSPENDED: 'tenant.suspended',
  TENANT_READ_ONLY: 'tenant.read_only',
  CLASS_FULL: 'class.full',
  CLASS_ARCHIVED: 'class.archived',
  CLASS_CAPACITY_EXCEEDED: 'class.capacity_exceeded',
  ENROLLMENT_ALREADY_ENROLLED: 'enrollment.already_enrolled',
  CHECKIN_CODE_INVALID: 'checkin.code_invalid',
  CHECKIN_NOT_ENROLLED: 'checkin.not_enrolled',
  CHECKIN_NO_SESSION_TODAY: 'checkin.no_session_today',
  CHECKIN_OUTSIDE_WINDOW: 'checkin.outside_window',
  ATTENDANCE_REVOKE_WINDOW_CLOSED: 'attendance.revoke_window_closed',
  GRADUATION_DEGREE_AT_MAX: 'graduation.degree_at_max',
  GRADUATION_BELT_INVALID_TARGET: 'graduation.belt_invalid_target',
  GRADUATION_ALREADY_REVERSED: 'graduation.already_reversed',
  GRADUATION_LESSONS_BELOW_MINIMUM: 'graduation.lessons_below_minimum',
  GRADUATION_CANNOT_DISABLE_NON_KIDS_BELT:
    'graduation.cannot_disable_non_kids_belt',
  STREAM_TICKET_INVALID: 'stream.ticket_invalid',
  BILLING_CHARGE_NOT_PAYABLE: 'billing.charge_not_payable',
  BILLING_METHOD_MANDATE_MISMATCH: 'billing.method_mandate_mismatch',
  BILLING_MANDATE_ALREADY_ACTIVE: 'billing.mandate_already_active',
  BILLING_REFUND_UNSETTLED: 'billing.refund_unsettled',
  BILLING_SIMULATE_UNAVAILABLE: 'billing.simulate_unavailable',
  PLAN_NOT_FOUND: 'plan.not_found',
  PLAN_ARCHIVED: 'plan.archived',
  PLAN_NAME_TAKEN: 'plan.name_taken',
  STORE_CATEGORY_IN_USE: 'category.in_use',
  STORE_PRODUCT_NOT_PURCHASABLE: 'store.product_not_purchasable',
  STORE_SIZE_REQUIRED: 'store.size_required',
  STORE_SIZE_INVALID: 'store.size_invalid',
  STORE_INSUFFICIENT_STOCK: 'store.insufficient_stock',
  STORE_ORDER_NOT_CANCELABLE: 'store.order_not_cancelable',
  STORE_ORDER_INVALID_TRANSITION: 'store.order_invalid_transition',
  VALIDATION_FAILED: 'validation.failed',
  NOT_FOUND: 'resource.not_found',
  CONFLICT: 'resource.conflict',
  INTERNAL: 'internal.error',
} as const;

export type ApiErrorCode = (typeof ApiErrorCodes)[keyof typeof ApiErrorCodes];

/** RFC 9457 problem document as serialized by the API's global filter. */
export interface ApiProblem {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  /** Field-level validation errors (422 only). */
  errors?: Array<{ field: string; messages: string[] }>;
}

/** Narrows an openapi-fetch `error` payload into a problem document. */
export function parseProblem(error: unknown): ApiProblem | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as Record<string, unknown>;
  if (typeof candidate['code'] !== 'string') return null;
  const status =
    typeof candidate['status'] === 'number' ? candidate['status'] : 0;
  return {
    ...(candidate as object),
    status,
    code: candidate['code'],
  } as ApiProblem;
}

/** True when the error payload carries the given stable code. */
export function isProblemCode(error: unknown, code: ApiErrorCode): boolean {
  return parseProblem(error)?.code === code;
}
