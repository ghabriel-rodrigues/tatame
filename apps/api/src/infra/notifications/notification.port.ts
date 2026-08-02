/**
 * Transactional-notification seam (backend ticket 06). The identity module
 * depends on this port only — Resend is one driver behind it, so tests and
 * key-less dev environments never touch the network.
 */
export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');

export interface PasswordResetNotification {
  to: string;
  fullName: string;
  /** Web fallback URL carrying the raw token. */
  resetUrl: string;
  /** Mobile deep link (`tatame://reset?token=...`). */
  deepLink: string;
}

export interface NotificationPort {
  sendPasswordReset(input: PasswordResetNotification): Promise<void>;
}
