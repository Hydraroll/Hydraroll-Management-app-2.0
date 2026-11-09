# HydraRoll Management App

React + TypeScript application for HydraRoll heavy transport service sheets, parts inventory, equipment files, and future QR-linked equipment histories.

## Current implementation

- Responsive landing page and independently mounted Service Sheets, Inventory / Stocks, and Files modules.
- Preserves the six supplied checklist variants and their status, comments, pressure tests, ball-valve pass/fail repairs, parts, notes, and signatures.
- Local preview mode keeps the prototype usable without cloud credentials.
- Supabase password sign-in and profile/role checks are prepared. With credentials configured, sign-in opens a safe foundation screen; service, stock, and file modules remain local-preview only until cloud data adapters and RLS tests are complete.
- Supabase SQL migration defines staff roles, operational tables, a private document bucket, and row-level policies. Do not use a service-role key in browser environment variables.
- PWA shell is precached. Inspection drafts can be kept locally; authenticated data operations still need connectivity. Offline queue and later sync conflict handling are intentionally left for a subsequent stage.

## Local development

Requires Node.js 20.19+ and pnpm.

```sh
pnpm install
pnpm dev
```

With no `.env.local`, the app opens in local preview mode. Local sheets and inventory stay in that browser. Files use browser IndexedDB.

## Supabase setup (not performed)

1. Create a Supabase project owned by Hydraroll.
2. Apply `supabase/migrations/0001_initial_schema.sql` in the Supabase SQL editor or with the Supabase CLI.
3. Create staff accounts in Supabase Auth, then add matching rows to `public.profiles` and `public.organization_memberships`. Set the first platform administrator role through the SQL editor. Public self-registration is not exposed by the app.
4. Add the project URL and publishable/anon key to `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Review RLS and Storage policies with the project owner before importing real customer or equipment records.

## Vercel setup (not performed)

Import this project into a Hydraroll-owned GitHub repository and connect that repository to a Hydraroll-owned Vercel team. Set the same two `VITE_` environment variables in Vercel. Add `app.hydraroll.com.au` to the Vercel project and follow Vercel's DNS instructions for that subdomain only. Do not change the apex domain or existing website records. No deployment or DNS change has been made.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm build
```

The original standalone prototype remains at `../outputs/Heavy-Transport-Service-Sheets.html`.
