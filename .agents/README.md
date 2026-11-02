# Project agent skills (Drishx-admin-and-backend)

Skills live in **`.agents/skills/`** as markdown (`SKILL.md` + optional references).

## Installed community skills

| Skill | Source | Use for |
|-------|--------|---------|
| `vercel-react-best-practices` | vercel-labs/agent-skills | React/Next performance |
| `vercel-composition-patterns` | vercel-labs/agent-skills | Component composition / React 19 |
| `web-design-guidelines` | vercel-labs/agent-skills | UI/a11y review |
| `prisma-cli` | prisma/skills | Prisma CLI workflows |
| `prisma-client-api` | prisma/skills | Queries, CRUD, transactions |
| `prisma-database-setup` | prisma/skills | Provider / connection setup |
| `prisma-upgrade-v7` | prisma/skills | v6→v7 migration notes |

## DrishX-specific skills

| Skill | Use for |
|-------|---------|
| `drishx-repo` | Repo map, stack, product scope |
| `drishx-nextjs` | Admin App Router, chrome, skeletons |
| `drishx-prisma` | This repo’s Prisma 7 + pooler patterns |
| `drishx-api-auth-audit` | API routes, JWT, audit/security |
| `drishx-client-api` | Admin UI fetch/mutation hooks, list pagination (`Paginated`), summary vs detail, loading & error (no React Query) |

## Update community skills

```bash
npx skills update -p -y
```

Add more:

```bash
npx skills add <owner/repo@skill> -y --copy
```

Custom DrishX skills are hand-maintained under `.agents/skills/drishx-*`.
