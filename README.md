# Enterprise Billing Platform

Full-stack invoicing, payments and reporting app.

- **Backend** — Express 5 + Supabase Postgres, JWT (Bearer **or** HttpOnly cookie + CSRF), bcrypt passwords, atomic Postgres RPCs for document conversion and create/update, audit log with dead-letter queue.
- **Frontend** — Next.js 14 (App Router) + TypeScript + Tailwind, dark sidebar, Inter font, server-rendered + client-side hybrid.
- **Workflow** — Inventory → Proposal → Quotation → Invoice → Payment, automatic at each hand-off, manual review/approval at each stage. Inventory stock auto-deducts on payment approval.
- **PDF + email** — PDFKit-rendered invoices/quotations/proposals, Resend transactional email.

## Workflow

```
                        +-- approve ---> auto-create -->
   Proposal create -->  Quotation       Invoice       Payment record
                        (review+edit)  (approve)     (approve)
                                                       |
                                                       v
                                              invoice marked paid
                                              + inventory deducted
```

1. **Create Proposal** — an Employee with `proposals.edit` access picks the customer + inventory items. The backend immediately spawns a linked **Draft Quotation** (the proposal is marked `converted` and becomes the audit record of where it started).
2. **Review Quotation** — Quotations team edits line items / prices / valid_until, then clicks **Mark Accepted**. The quotation flips to `accepted` and a linked **Draft Invoice** is auto-created.
3. **Approve Invoice** — Invoice team clicks **Approve** on the invoice detail page. Status moves to `approved`. Now payments can be recorded.
4. **Record Payment** — payment row is inserted with `approval_status='pending'`. The invoice is NOT yet credited.
5. **Approve Payment** — Accountant clicks **Approve** on the payment detail page. The Postgres RPC recalculates the invoice (status → `partially_paid` or `paid`) AND deducts stock from every line item referencing a product, logging each move into `stock_movements`.

Every step writes an audit-log row. The audit table includes a dead-letter queue (`audit_logs_failed`) for any writes that fail.

## Roles

| Role | Users | Audit Logs | Inventory / Proposals / Quotations / Invoices / Payments |
|---|---|---|---|
| **Admin** | full CRUD + module assignment | view + export | full CRUD + approve everywhere |
| **Manager** | view-only | view + export | full CRUD + approve everywhere |
| **Employee** | hidden | hidden | per-module: `view` (read-only) or `edit` (full CRUD on assigned modules); other modules are read-only |
| **Viewer** | hidden | hidden | read-only on all five modules + Reports |

Employee module assignment is per-user, stored in `user_module_access`. An Employee with `inventory.edit` + `proposals.view` can add inventory items and create proposals from them, but everything else is read-only. Viewers see the same pages with all create/edit/delete affordances hidden. Admins manage this via **Users → New / Edit User** in the UI.

The legacy **Accountant** role has been removed (phase 10 migration). Any user still on that role on an older DB gets `role_id = NULL` after the migration runs and must be reassigned.

## Chain integrity (rejection cascades)

The document chain has bidirectional cascade so a broken chain is visibly dead from any side you look at it:

| Trigger | Effect |
|---|---|
| Proposal deleted / cancelled | Linked quotation (if still `draft` or `sent`) is automatically `rejected` |
| Quotation rejected / cancelled / deleted | Upstream proposal (if still `converted`) is automatically marked `rejected` |
| Invoice cancelled / deleted | Upstream quotation (if still `converted`) is automatically marked `rejected` |

Every cascade writes a `*_cascade_rejected` audit log entry with the upstream/downstream ID + reason, so you can trace why a row went terminal.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18 LTS or newer |
| npm | bundled with Node |
| Supabase project | https://supabase.com (free tier is fine) |
| Resend account | https://resend.com (optional — emails no-op without it) |

---

## Quick start (zero to running)

```bash
# 1. Clone
git clone https://github.com/theyogendra/web-application.git
cd web-application

# 2. Backend
cd backend
cp .env.example .env             # then edit with your Supabase / JWT / Resend values
npm install
npm run dev                      # http://localhost:8000

# 3. Frontend (in a second terminal)
cd ../frontend
cp .env.example .env.local       # default points at http://localhost:8000
npm install
npm run dev                      # http://localhost:3000
```

Then apply database migrations (see below) and visit http://localhost:3000.

Default sign-in (seeded by the users/roles migration):

```
admin@enterprise.com
admin123
```

> Change this password right after first login — it's plaintext-seeded so the lazy bcrypt migration can hash it on the next sign-in.

---

## Database migrations

The schema lives in [`supabase/migrations/`](supabase/migrations/), eight files applied in chronological order:

| File | Adds |
|---|---|
| `20260511175701_initial_schema.sql` | users, products, orders, order_items |
| `20260512130000_invoice_foundation.sql` | customers, vendors, invoices, invoice_items |
| `20260512133000_invoice_validation_phase2.sql` | validation columns + invoice_validation_logs + audit_logs |
| `20260512143000_invoice_stock_control_phase3.sql` | stock columns + stock_movements + 4 stock RPCs |
| `20260522120000_billing_payments_phase4.sql` | denormalized billing columns, payments, email_logs, company_settings, record_invoice_payment RPC |
| `20260522130000_users_roles_phase5.sql` | user profile columns, roles table with seeded Admin/Manager/Accountant/Viewer, user_sessions |
| `20260522140000_inventory_quotations_proposals_phase6.sql` | product enhancements, quotations + items, proposals + items, conversion FKs |
| `20260522150000_convert_rpcs_phase7.sql` | atomic `convert_proposal_to_quotation` and `convert_quotation_to_invoice` RPCs |
| `20260522160000_atomic_crud_audit_dlq_phase8.sql` | audit_logs_failed dead-letter, 6 atomic create/update RPCs, 6 reports SQL aggregations |
| `20260522170000_workflow_roles_phase9.sql` | user_module_access table, Employee role, refreshed Admin/Manager perms, payment approval columns + RPCs (record/approve/reject), inventory deduction on full payment |
| `20260522180000_legacy_roles_cleanup_phase10.sql` | Removes Accountant role; restores Viewer as a clean read-only system role |

### Apply with the Supabase CLI (recommended)

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

### Apply manually

Open the Supabase SQL Editor for your project and paste each file in the order above.

---

## Project structure

```
backend/
  src/
    config/          Supabase client + env loader
    middleware/      auth (JWT), CSRF, error handler
    routes/          REST routes (mounted at /api/* and /api/v1/*)
    services/        audit, email, PDF, reports, numbering, totals, invoice-validation
    utils/           CSV serializer, sanitizeSearch + escapeHtml helpers
frontend/
  app/               Next.js App Router pages (login, dashboard, every module)
  components/        Sidebar, LayoutShell, InvoiceForm, DocumentForm, ProductForm, StatusBadge, ui primitives
  lib/               api client, auth (token + cookie), format, totals
supabase/
  migrations/        SQL files (see above)
  config.toml        Supabase CLI config
```

---

## Auth flow

- **Login** posts to `POST /api/auth/login` (multipart `username` / `password`).
- Backend issues a JWT and sets it as both a body field (`access_token`) **and** an HttpOnly `token` cookie + non-HttpOnly `csrf` cookie.
- Frontend `lib/api.ts` sends `credentials: 'include'` so cookies travel, and mirrors the CSRF cookie back as `X-CSRF-Token` on every POST/PUT/DELETE.
- `requirePermission('invoices.create')` etc. is enforced server-side. Permission strings live on `roles.permissions` (JSONB array of `"module.action"` strings).
- Lazy bcrypt migration: plaintext passwords seeded into `users.password` get hashed into `password_hash` on the user's next successful sign-in.

---

## Email (Resend)

- Templates: invoice sent, payment receipt, invoice paid, overdue reminder, quotation sent, proposal sent.
- Set `RESEND_API_KEY` to enable. Set `FROM_EMAIL` to a sender on a **verified domain** in Resend (the default `onboarding@resend.dev` only delivers to the email tied to your Resend account).
- Every send is recorded in the `email_logs` table with status `sent` / `skipped` / `failed`. View at `GET /api/email/logs`.

---

## Security notes

- **Never commit `.env`** — `.gitignore` covers `**/.env*` with an `!**/.env.example` allow-rule.
- **Rotate keys** that appear in commit messages, conversation transcripts, or PRs.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — treat it like a root credential.
- `JWT_SECRET` change invalidates all existing sessions on next request.
- Audit log entries redact any field whose name matches `password`, `secret`, `token`, `api_key`, `authorization`, `cookie`, or `private_key`.

---

## Useful endpoints

```
GET    /health                              liveness + DB connectivity
POST   /api/auth/login                      multipart username + password
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/invoices                        ?status= &search= &from= &to=
POST   /api/invoices                        create (auto-numbered)
GET    /api/invoices/:id                    detail + items + payments
PUT    /api/invoices/:id                    update
DELETE /api/invoices/:id                    delete (draft) or cancel
POST   /api/invoices/:id/send               email + PDF attachment
GET    /api/invoices/:id/pdf                download
POST   /api/invoices/:id/send-reminder

POST   /api/payments                        record (overpayment-guarded RPC)
GET    /api/payments
GET    /api/payments/export                 CSV

POST   /api/quotations/:id/convert-to-invoice   atomic RPC
POST   /api/proposals/:id/convert-to-quotation  atomic RPC

POST   /api/quotations/:id/mark-accepted        approves + auto-creates linked invoice
POST   /api/invoices/:id/approve                approval workflow (legacy + phase 9)
POST   /api/payments/:id/approve                accountant approval + invoice recalc + inventory deduction
POST   /api/payments/:id/reject

GET    /api/users                               admin/manager
POST   /api/users                               admin: create user + module_access
PUT    /api/users/:id                           admin: edit (incl. role + module_access)
DELETE /api/users/:id                           admin: deactivate

GET    /api/reports/summary                 all KPIs in one SQL call
GET    /api/reports/revenue
GET    /api/reports/invoices
GET    /api/reports/payments
GET    /api/reports/customers
GET    /api/reports/tax
GET    /api/reports/export?type=&format=     CSV or PDF

GET    /api/audit-logs                      filter by module/action/user/date
GET    /api/audit-logs/export

GET    /api/users
GET    /api/roles
GET    /api/customers
GET    /api/company-settings
```

All endpoints are mounted under both `/api/*` and `/api/v1/*` for compatibility.

---

## Common tasks

```bash
# Just verify the backend boots (no DB required)
cd backend && node -e "require('./src/server')"

# Frontend type-check + production build
cd frontend && npm run build

# Tail the dev server log
cd backend && npm run dev
```
