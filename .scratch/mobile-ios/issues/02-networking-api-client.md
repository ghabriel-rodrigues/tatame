# Networking & API client

Type: research
Blocked by: 01

## Question

Which HTTP stack talks to the NestJS backend: plain URLSession + Codable (async/await, custom thin client) vs Alamofire — is Alamofire worth the dependency in an async/await world? Cover error modeling, request building/interception (auth header injection, refresh hooks), and testability (URLProtocol stubbing). Also evaluate OpenAPI codegen for Swift from the backend's spec (apple/swift-openapi-generator with URLSession transport, vs openapi-generator's swift5, vs hand-written DTOs) — generated-code ergonomics, Codable fidelity, and how regeneration is versioned inside the Xcode/SPM setup. Recommend the stack and the codegen workflow.
