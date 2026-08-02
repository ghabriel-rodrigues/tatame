# TanStack Query patterns and OpenAPI client generation

Type: research
Status: open

## Question

What are the TanStack Query conventions for this app, and how is the API client generated from the NestJS backend's OpenAPI spec? Research: generator choice (openapi-typescript + openapi-fetch, Orval with TanStack Query mode, Hey API, openapi-ts) and where the generated client lives in the monorepo (shared package consumable by web and RN?); query key factory conventions; cache invalidation patterns for the domain (check-ins, attendance, payments, graduations); optimistic updates (e.g. manual roll call toggles); pagination/infinite lists (students, academies); error normalization; and how multi-tenant context (academy id) and auth headers thread through the generated client.
