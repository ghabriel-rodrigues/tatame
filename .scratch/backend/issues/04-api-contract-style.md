# API contract style

Type: research + grilling

## Question

What API contract style should the backend expose to its four clients (React web, Expo RN, Kotlin, Swift) — REST + OpenAPI (with generated typed clients per platform) or a tRPC-like end-to-end-typed approach? Research the options in the NestJS context (OpenAPI decorators + codegen for TS/Kotlin/Swift vs ts-rest/tRPC-style, which only benefits the TS clients), then decide — including validation conventions (class-validator vs zod DTOs), error-response shape, and pagination/filtering conventions. Note that Kotlin and Swift native clients make platform-neutral contracts (OpenAPI) structurally attractive; the decision must serve all four clients equally.
