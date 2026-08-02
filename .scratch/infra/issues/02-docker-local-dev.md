# Docker strategy for local dev

Type: grilling
Blocked by: 01

## Question

What is the local-dev docker strategy? Postgres already runs via the existing `docker-compose.yml`. Decide: whether the NestJS API also runs as a container locally (with watch/hot-reload) or directly on the host against the dockerized Postgres, what other services join the compose file (Stripe CLI webhook forwarder? mail-capture container if Resend needs a local fake? Redis if the backend map adopts queues), compose profiles for minimal vs full stacks, volume/port/naming conventions, and the single-command dev-up experience (`rtk`-prefixed) the README should document.
