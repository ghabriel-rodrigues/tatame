import { z } from 'zod';

/** `15m`, `30d`, `12h`, `45s` → milliseconds. */
export function durationToMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  const amount = Number(match[1]);
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return amount * unit;
}

const duration = z.string().regex(/^\d+[smhd]$/, 'expected e.g. 15m, 30d');

/**
 * Environment contract (infra ticket 05): validated fail-fast at bootstrap —
 * a misconfigured process never starts.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_ACCESS_TTL: duration.default('15m'),
  JWT_REFRESH_TTL: duration.default('30d'),
  /** Absent in dev/test → console notification driver (never hard-fail). */
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default('no-reply@tatame.app'),
  WEB_URL: z.string().url().default('http://localhost:4200'),
  /** AES key material for TOTP secrets at rest; falls back to the JWT secret. */
  TOTP_ENC_KEY: z.string().optional(),
  /**
   * Payment provider behind the PaymentProviderPort (spec 006, two-stage
   * decision): `simulated` is the only runtime driver in v1; `stripe` selects
   * the compile-checked Connect stub (stage-2 swap).
   */
  PAYMENTS_PROVIDER: z.enum(['simulated', 'stripe']).default('simulated'),
});

export type Env = z.infer<typeof envSchema>;

/** Typed, derived configuration injected via the APP_CONFIG token. */
export interface AppConfig {
  nodeEnv: Env['NODE_ENV'];
  port: number;
  databaseUrl: string;
  jwtAccessSecret: string;
  /** e.g. `15m` — handed to @nestjs/jwt signOptions. */
  jwtAccessTtl: string;
  jwtAccessTtlMs: number;
  refreshTtlMs: number;
  resendApiKey: string | null;
  resendFromEmail: string;
  webUrl: string;
  totpEncKey: string;
  /** Driver behind the PaymentProviderPort — gates the simulate endpoint. */
  paymentsProvider: 'simulated' | 'stripe';
  isProduction: boolean;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/** zod-validated env → AppConfig. Used by ConfigModule `validate` (fail fast). */
export function validateEnv(env: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration — ${detail}`);
  }
  return parsed.data;
}

export function buildAppConfig(env: Env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV,
    port: env.API_PORT,
    databaseUrl: env.DATABASE_URL,
    jwtAccessSecret: env.JWT_ACCESS_SECRET,
    jwtAccessTtl: env.JWT_ACCESS_TTL,
    jwtAccessTtlMs: durationToMs(env.JWT_ACCESS_TTL),
    refreshTtlMs: durationToMs(env.JWT_REFRESH_TTL),
    resendApiKey: env.RESEND_API_KEY ?? null,
    resendFromEmail: env.RESEND_FROM_EMAIL,
    webUrl: env.WEB_URL,
    totpEncKey: env.TOTP_ENC_KEY ?? env.JWT_ACCESS_SECRET,
    paymentsProvider: env.PAYMENTS_PROVIDER,
    isProduction: env.NODE_ENV === 'production',
  };
}
