# Networking & API client

Type: research
Blocked by: 01

## Question

Which HTTP stack talks to the NestJS backend: Retrofit (+ OkHttp) vs Ktor Client, with `kotlinx.serialization` for JSON? Compare coroutine ergonomics, interceptor/plugin model (auth header injection, refresh, logging), error modeling, and testability. Also evaluate OpenAPI codegen from the backend's spec (openapi-generator kotlin generators, Fabrikt, or hand-written DTOs) — codegen fidelity with `kotlinx.serialization`, nullability correctness, and how generated code is versioned/regenerated inside the standalone Gradle project. Recommend the stack and the codegen workflow.
