# Core entity model

Type: grilling
Blocked by: 01, 02

## Question

What is the core entity model for the full product? Cover: organizations (academy = tenant, with status Ativa/Trial/Inadimplente/Suspensa), users and role assignments (RBAC across the six personas, including platform team roles Owner/Suporte/Financeiro), guardian↔minor links (1 guardian → N children; minors always linked), turmas (recurring weekly schedule, professor, capacity, belt min/max, enrollment), presenças (unique per class-occurrence per student; method QR/code/manual), events + registrations (free vs paid, per-dependent confirmation), notifications, store (products, orders with status flow), and invite links (7-day validity, academy+class+plan inherited, aluno vs responsável type). Decide table shapes, keys, relationships, and enum vs lookup-table choices, expressed in the chosen ORM's schema idiom and consistent with the chosen tenant-isolation strategy.
