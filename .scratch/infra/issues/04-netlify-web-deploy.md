# Netlify deploy wiring for web

Type: research
Blocked by: 01, 03

## Question

How is the React web app deployed to Netlify from the nx monorepo? Research and define: build wiring (base directory, `nx build web` command, publish directory, monorepo-aware settings), Netlify-side build vs CI-built artifact deploy (and how that interacts with the chosen CI pipeline), deploy previews per PR and what API they point at, SPA redirect rules and security headers, environment-variable configuration per deploy context, and custom-domain/HTTPS expectations. Netlify as the web host is a fixed decision; this ticket wires it, not questions it.
