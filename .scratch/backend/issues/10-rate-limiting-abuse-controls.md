# Rate limiting and abuse controls

Type: research
Blocked by: 02

## Question

Graduated from the map's fog by ticket 02 (authn design fixed the sensitive surface). Decide the rate-limiting/abuse-control strategy: `@nestjs/throttler` configuration (global tiers + per-endpoint overrides per `LLM_WIKI/raw/skills/nestjs/rules/security-rate-limiting.md`), strict limits for `POST /v1/auth/login` (+ `/login/totp`), `POST /v1/auth/password/forgot`, and the public invite endpoints (`GET/POST /v1/public/invites/:token[...]`, token-guessing surface), brute-force protection on attendance check-in codes (short numeric codes — attempt caps per class occurrence), whether per-account lockout/backoff complements per-IP throttling, storage backend (in-memory vs Redis — depends on infra map's deploy topology), and 429 problem+json shape (`Retry-After`, stable `code`).
