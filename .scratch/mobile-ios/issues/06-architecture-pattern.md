# Architecture pattern: MV vs MVVM vs TCA

Type: grilling
Blocked by: 01

## Question

Which app architecture does the iOS codebase use: plain SwiftUI "MV" (views + observable model objects, Observation framework), classic MVVM (one ViewModel per screen), or TCA? Bias: **keep it simple** — this is a parity port of already-specified screens, not a greenfield design; weigh boilerplate cost, testability of the chosen testing strategy, Swift Concurrency fit (consult `twostraws__Swift-Concurrency-Agent-Skill` and `twostraws__SwiftUI-Agent-Skill`), navigation state modeling for the persona shells (tab + stacked details + sheets), and how server state (fetch/cache/invalidate — TanStack-Query-like needs) is handled without a heavy framework. Pick one and define the per-screen conventions.
