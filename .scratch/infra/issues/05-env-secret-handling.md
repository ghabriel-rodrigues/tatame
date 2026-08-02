# Env & secret handling across apps

Type: grilling
Blocked by: 01, 02

## Question

What are the env/secret conventions across all apps? Decide: the `.env` file taxonomy per app and environment (extending the existing root `.env.example`), naming conventions and a documented variable inventory (DB URL, JWT secrets, Stripe keys + webhook secret, Resend key, per-app API base URLs), how docker compose consumes env locally, validated typed config in the NestJS API (fail-fast on missing vars), how client apps get their build-time public config (web via Netlify contexts and Vite/webpack env; Expo/Kotlin/Swift equivalents) without ever embedding server secrets, where CI/deploy secrets live (CI secret store, Netlify UI), and the rule set for keeping secrets out of git.
