# Customer / equipment RLS acceptance tests

Run these checks against a throwaway Supabase project after applying migrations `0001` and `0002`. Use real authenticated JWTs or Supabase's local test harness; do not use the service role for the read-path checks because it bypasses RLS. Keep seeded test data disposable.

Create two customer organisations (A and B), one internal Hydraroll organisation, two customer users (one per customer), a customer admin in A, an internal manager, and a technician. Create sites and equipment for each customer. Link one report to each asset and set one report `approved` + `customer_visible=true`, while leaving another draft/internal.

| Test as | Operation | Expected |
|---|---|---|
| Customer user A | Select organisations, sites, contacts and equipment | Only A records are visible |
| Customer user A | Select B equipment by known UUID | Zero rows; direct `can_read_equipment`/detail lookups disclose no record |
| Customer user A | Select reports for A's asset | Approved and customer-visible reports only |
| Customer user A | Select draft or unapproved report | No row |
| Customer admin A | Insert/update a site/contact with A organisation ID | Allowed |
| Customer admin A | Insert/update a site/contact with B organisation ID | Rejected or no row affected |
| Customer user A | Insert/update a site/contact | Rejected |
| Customer role A | Insert/update equipment or change its owner | Rejected |
| Internal technician | Read assigned internal operational register | Allowed according to internal scope; customer ownership isolation remains enforced in customer views |
| Internal technician | Create or edit equipment register/catalogue | Rejected |
| Internal manager | Create equipment under a customer A and link an A site | Allowed |
| Internal manager | Link equipment to B site while owner is A | Must be rejected by a database constraint/trigger before production enablement |
| Any authenticated user | Change an existing `asset_id` | Rejected by immutable-ID trigger |
| Anonymous user | Read organisation or equipment data | Rejected |
| Any role | Scan/open a QR route without membership | No asset details; QR navigation grants no access |

Additional relational checks before enabling writes: reject cross-organisation site assignments; prevent parent equipment cycles and cross-customer parent links; verify ownership changes append history; ensure old service reports remain visible only according to their recorded customer relationship; and ensure customer-visible file access requires an approved metadata record and private signed storage access.

This checklist is a test specification only. It has not run against a Supabase database in the current workspace, so customer data and customer login must remain disabled until these checks pass in an isolated test project.
