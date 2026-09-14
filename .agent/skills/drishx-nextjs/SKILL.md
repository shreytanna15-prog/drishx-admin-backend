---
name: drishx-nextjs
description: Next.js 16 App Router conventions for the DrishX admin panel — AdminChrome, AdminPage, loading skeletons, route groups. Use when editing admin pages, layouts, loading.tsx, navigation, or Next.js APIs in this repo.
---

# DrishX Next.js (Admin)

## Critical

This is **not** classic Next.js from training data. Read `node_modules/next/dist/docs/` before using unfamiliar APIs. Heed deprecations.

## Admin chrome

- Layout: `app/(admin)/layout.tsx` → `<AdminChrome>{children}</AdminChrome>`
- Pages: wrap content in `<AdminPage title="…" subtitle="…">` from `components/admin-shell.tsx`
- Do **not** remount full-page auth chrome per route — auth gate is cold-start only
- Login stays in `app/login` (outside `(admin)`)

## Loading UX

- Route-level: `app/(admin)/loading.tsx` → `PageBodySkeleton`
- In-page fetch: use `components/admin-skeletons.tsx`
  - `TableSkeleton` — tables / audit lists
  - `ListSkeleton` — employees, clients, roles
  - `DetailSkeleton` — detail pages
  - `CardGridSkeleton` — dashboard KPIs
- No plain `"Loading…"` text for page/data load (button `Loader2` action spinners are OK)
- Sidebar nav must use `next/link` `Link` (client transitions)

## Patterns

- Most admin pages are `"use client"` with `useEffect` data loads via `app/lib/admin-*.ts`
- Prefer existing `adminFetch` / list cache helpers over new ad-hoc fetch wrappers
- Brand tokens: `text-(--brand-text)`, `border-(--brand-card-border)`, `bg-(--brand-card)`, etc.
- Icons: `lucide-react` only

## Do not

- Put authenticated admin pages outside `app/(admin)/`
- Reintroduce per-page `AdminShell` remounts that blank the sidebar
- Add new UI libraries without an explicit ask
