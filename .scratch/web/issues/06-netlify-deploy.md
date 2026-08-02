# Netlify deploy setup

Type: task
Status: open
Blocked by: 01

## Question

Set up Netlify hosting for the web app (fixed decision, sandbox/test mode from day one): create/link the Netlify site, `netlify.toml` with build command wired to the nx/Vite build and publish dir, SPA redirect rule (`/* → /index.html 200`), environment variables per context (API base URL for deploy previews vs production), and deploy previews on PRs. Record resulting facts (site name, URLs, where credentials live) for later tickets.
