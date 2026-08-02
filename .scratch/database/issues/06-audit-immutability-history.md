# Audit & immutability of graduation and attendance history

Type: grilling
Blocked by: 03, 04

## Question

How is immutability of graduation history (who promoted, when — a BOSS non-negotiable) and attendance history enforced at the schema level — append-only tables, DB triggers/permissions blocking UPDATE/DELETE, event-style records, or application-layer discipline? Also decide the audit trail shape for sensitive actions that must be traceable (platform "entrar como admin" impersonation, promotions, manual attendance edits by professors): what gets audited, in which table(s), and how corrections to genuinely wrong records happen without violating immutability (compensating records vs annotated voids).
