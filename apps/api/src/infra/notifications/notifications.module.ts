import { Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
  type PasswordResetNotification,
} from './notification.port.js';

/** Dev/test driver: logs instead of sending — no network, no key. */
class ConsoleNotificationDriver implements NotificationPort {
  private readonly logger = new Logger('Notifications');

  async sendPasswordReset(input: PasswordResetNotification): Promise<void> {
    this.logger.log(
      `[console driver] password-reset for ${input.to}: ${input.resetUrl} (${input.deepLink})`,
    );
  }
}

/**
 * Resend driver over plain HTTPS (no SDK dependency). Only wired when
 * RESEND_API_KEY is present; failures are logged, never thrown into the
 * request path (forgot-password answers 202 regardless).
 */
class ResendNotificationDriver implements NotificationPort {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async sendPasswordReset(input: PasswordResetNotification): Promise<void> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [input.to],
          subject: 'Tatame — redefinição de senha',
          html: [
            `<p>Olá, ${input.fullName}.</p>`,
            '<p>Recebemos um pedido para redefinir sua senha. O link vale por 1 hora e só pode ser usado uma vez.</p>',
            `<p><a href="${input.resetUrl}">Redefinir senha</a></p>`,
            `<p>No celular, abra: <a href="${input.deepLink}">${input.deepLink}</a></p>`,
            '<p>Se você não pediu isso, ignore este e-mail.</p>',
          ].join('\n'),
        }),
      });
      if (!response.ok) {
        this.logger.error(
          `Resend API error ${response.status}: ${await response.text()}`,
        );
      }
    } catch (error) {
      this.logger.error(`Resend request failed: ${(error as Error).message}`);
    }
  }
}

@Module({
  providers: [
    {
      provide: NOTIFICATION_PORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): NotificationPort =>
        config.resendApiKey
          ? new ResendNotificationDriver(
              config.resendApiKey,
              config.resendFromEmail,
            )
          : new ConsoleNotificationDriver(),
    },
  ],
  exports: [NOTIFICATION_PORT],
})
export class NotificationsModule {}
