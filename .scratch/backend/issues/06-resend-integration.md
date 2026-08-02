# Resend integration

Type: research
Blocked by: 01

## Question

How should Resend be integrated for transactional email (sandbox/test mode from day one)? Research and define: the mail module seam (single injectable mail service wrapping the Resend SDK), template strategy (React Email vs plain HTML templates, PT-BR copy, per-academy white-label theming of emails), the initial transactional email inventory (password reset, invite links, payment receipts/reminders, event confirmations, graduation notifications), sending domain/DNS setup expectations, delivery-failure handling, and how emails are faked/captured in local dev and tests.
