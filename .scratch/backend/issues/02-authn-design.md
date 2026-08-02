# Authentication design

Type: grilling
Blocked by: 01

## Question

What is the authentication design? Decide: JWT access/refresh token scheme (lifetimes, rotation, revocation, storage guidance per client — web vs the 3 mobile apps), how sessions relate to persona apps (one account usable across personas vs per-surface login; the same person can be e.g. professor and admin), password reset flow via Resend, invite-link tokens for the public Convite flow (7-day validity, academy+class+plan payload, aluno vs responsável variant, minor-requires-guardian rule), and how "sair" (logout) invalidates state. Authentication + authorization is the fixed first feature, so this design must be complete enough to build against.
