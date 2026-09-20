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
  // attendance (spec 004)
  CHECKIN_CODE_INVALID: 'checkin.code_invalid',
  CHECKIN_NOT_ENROLLED: 'checkin.not_enrolled',
  CHECKIN_NO_SESSION_TODAY: 'checkin.no_session_today',
  CHECKIN_OUTSIDE_WINDOW: 'checkin.outside_window',
  ATTENDANCE_REVOKE_WINDOW_CLOSED: 'attendance.revoke_window_closed',
  STREAM_TICKET_INVALID: 'stream.ticket_invalid',
  // graduation (spec 005)
  GRADUATION_DEGREE_AT_MAX: 'graduation.degree_at_max',
  GRADUATION_BELT_INVALID_TARGET: 'graduation.belt_invalid_target',
  GRADUATION_ALREADY_REVERSED: 'graduation.already_reversed',
  GRADUATION_LESSONS_BELOW_MINIMUM: 'graduation.lessons_below_minimum',
  GRADUATION_CANNOT_DISABLE_NON_KIDS_BELT:
    'graduation.cannot_disable_non_kids_belt',
  // billing (spec 006)
  BILLING_CHARGE_NOT_PAYABLE: 'billing.charge_not_payable',
  BILLING_METHOD_MANDATE_MISMATCH: 'billing.method_mandate_mismatch',
  BILLING_MANDATE_ALREADY_ACTIVE: 'billing.mandate_already_active',
  BILLING_REFUND_UNSETTLED: 'billing.refund_unsettled',
  /** Reserved for non-hidden gating; the simulate route is 404 by default. */
  BILLING_SIMULATE_UNAVAILABLE: 'billing.simulate_unavailable',
  PLAN_NOT_FOUND: 'plan.not_found',
  PLAN_ARCHIVED: 'plan.archived',
  PLAN_NAME_TAKEN: 'plan.name_taken',
  // events (spec 008)
  /** Publish (or a published-state edit) without date/local — the friendly face of events_published_ck. */
  EVENT_PUBLISH_REQUIREMENTS: 'event.publish_requirements',
  /** Registration or Comunicar against a draft/canceled event. */
  EVENT_NOT_PUBLISHED: 'event.not_published',
  /** Self-cancel of a paid, settled (confirmed) registration — admin refund is the only way back. */
  EVENT_REGISTRATION_SETTLED: 'event.registration_settled',
  // store (spec 009)
  /** Category delete while products still reference it (restrict FK's friendly face). */
  STORE_CATEGORY_IN_USE: 'category.in_use',
  /** Purchase against an archived (or otherwise non-purchasable) product. */
  STORE_PRODUCT_NOT_PURCHASABLE: 'store.product_not_purchasable',
  /** The product defines sizes and the order carries none. */
  STORE_SIZE_REQUIRED: 'store.size_required',
  /** The given size is not one of the product's size pills (or the product is sizeless). */
  STORE_SIZE_INVALID: 'store.size_invalid',
  /** quantity > stock_qty at order creation (no reservation, no partial fulfillment). */
  STORE_INSUFFICIENT_STOCK: 'store.insufficient_stock',
  /** Buyer cancel outside `pending` — a paid order is undone only by the admin refund. */
  STORE_ORDER_NOT_CANCELABLE: 'store.order_not_cancelable',
  /** Board transition outside paid → ready → delivered (+ canceled from paid/ready). */
  STORE_ORDER_INVALID_TRANSITION: 'store.order_invalid_transition',
  // profile (spec 013)
  /** CPF/RG change after being set — write-once (settable while NULL only). */
  PROFILE_FIELD_LOCKED: 'profile.field_locked',
  /** Email/birth date in the profile payload — read-only identity/auth facts. */
  PROFILE_FIELD_READ_ONLY: 'profile.field_read_only',
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
