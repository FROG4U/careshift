# CareShift — NDIS Care Management Platform

A multi-tenant, white-label care-management SaaS modelled on ShiftCare, built for an
Australian (NDIS) care provider to self-host and eventually resell.

## Stack
- **Next.js 16** (App Router, server actions) + **React 19**
- **Prisma 6** ORM. Dev uses **SQLite** (`prisma/dev.db`). For production switch
  `datasource.provider` to `postgresql` and update `DATABASE_URL`.
- **Tailwind 4**
- Auth is **custom**: `jose` JWT in an httpOnly cookie + `bcryptjs`. See `src/lib/auth.ts`.

## Run
```bash
npm run dev -- --port 3100      # http://localhost:3100
npx prisma migrate dev          # apply schema changes
npx tsx prisma/seed.ts          # reseed demo data
```
Seed logins (password `password123`): `admin@careshift.test` (admin),
`bianca@careshift.test` (support worker).

## Architecture
- **Multi-tenant**: every row carries `tenantId`. `Tenant` holds white-label branding
  (`name`, `brandColor`, `logoUrl`). `requireTenant()` (`src/lib/tenant.ts`) scopes queries.
- **Roles**: `ADMIN`, `COORDINATOR`, `WORKER` (strings — SQLite has no enums; see
  `src/lib/constants.ts`). Workers land on `/my-shifts`; office staff on `/dashboard`.
- **Routes**: office app under `src/app/(app)/` (sidebar layout, auth-guarded in
  `layout.tsx`). Worker mobile app at `src/app/my-shifts/`.
- **Branding** is applied via a `--brand` CSS variable set from `tenant.brandColor`.

## Key features (Phase 1 — done)
Dashboard, Participants (NDIS clients), Staff (with worker-screening expiry alerts),
weekly Schedule + shift creation, worker **clock-in/out with GPS geofence** (1km default,
Haversine check in `src/app/my-shifts/actions.ts`), Timesheets approval, white-label Settings.

## Roadmap (not built yet)
Phase 5+: NDIS Price Guide catalogue, invoicing + PRODA/PACE bulk claiming, care plans &
goals, incident management, eMAR medication, family portal, then native app wrapper.

@AGENTS.md
