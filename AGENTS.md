<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project agent skills

Repo-local skills live in `.agents/skills/` (also linked as `.agent/` and `.cursor/skills/`).

Read the matching skill **before** substantial work:

| When working on… | Skill |
|------------------|--------|
| Orientation / where code belongs | `drishx-repo` |
| Admin pages, layouts, loading UX | `drishx-nextjs` |
| Schema, migrations, Prisma queries | `drishx-prisma` (+ official `prisma-*`) |
| `app/api`, auth, audit logs | `drishx-api-auth-audit` |
| Admin UI fetch / mutate / loading / errors | `drishx-client-api` |
| React/Next performance | `vercel-react-best-practices` |
| Component composition | `vercel-composition-patterns` |

See `.agents/README.md` for the full catalog and update commands.
