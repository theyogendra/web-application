# InvoicePro Enterprise Platform

### World-Class Cloud-Native Invoicing, Payments, and Financial Operations Suite

InvoicePro Enterprise is a high-performance, secure, and modular SaaS platform designed for large-scale financial operations. The system automates document workflow cascades—spanning Proposals, Quotations, Invoices, and Payments—while guaranteeing transactional consistency, regulatory compliance, and bulletproof audit trails.

---

## 1. Enterprise Architecture Overview

The InvoicePro Enterprise backend is built on a **cloud-native**, **API-first**, **service-oriented**, and **modular** architecture designed to scale with your organization. The front-end delivers a unified, **responsive**, and **accessible** user experience.

### Architecture Topology

- **API and Business Layer**: An asynchronous Node.js engine powered by Express 5, serving secure JSON API endpoints mounted at `/api/*` and `/api/v1/*`.
- **Primary Data Platform**: **Supabase Database (Managed Cloud Database)** providing high-throughput relational transaction processing, automatic backup scaling, and real-time synchronization.
- **Dynamic Role-Based Access Control (RBAC)**: Fine-grained, token-based authorization gating modules, specific actions (view/edit), and administrative overrides.
- **Workflow Automation**: High-integrity, atomic **Supabase Transactional Operations** executing state conversions, stock reservations, and payment allocations.
- **Secure File Delivery**: Transactional document generation (PDFKit) integrated with the **Universal Export Center** and backed by **Supabase Storage**.

---

## 2. Platform Capabilities

InvoicePro Enterprise is a multi-sector financial engine optimized for:

- **Wholesale and Distribution**: Multi-warehouse stock tracking, real-time inventory reservation, and payment-triggered stock movements.
- **Manufacturing & Construction**: Phase-based proposal and quotation pipelines, contract revisions, and milestone-based payments.
- **Healthcare & Retail**: Secure auditing, rate-limited portal entries, and high-frequency tax logging.
- **Logistics & Financial Services**: Flexible currencies, dynamic client profiles, and automated accounting syncs.

---

## 3. High-Integrity Document Lifecycle

The system enforces transactional integrity across the financial document chain. Status changes automatically propagate upstream and downstream.

```
                        +-- approve ---> auto-create -->
    Proposal Create --> Quotation       Invoice       Payment Record
                        (Review+Edit)  (Approve)     (Approve)
                                                       |
                                                       v
                                              Invoice Marked Paid
                                              + Inventory Deducted
```

### Document Flow Execution

1. **Proposal Phase**: Draft proposals list client requirements. Approving a proposal triggers the creation of a linked **Draft Quotation** and sets the proposal to `converted` (preserving original estimates).
2. **Quotation Phase**: Quotation Managers adjust pricing, validate time limits, and confirm terms. Marking a quotation as accepted sets the status to `accepted` and auto-creates a linked **Draft Invoice**.
3. **Invoice Phase**: Billing teams run system validation rules. Approving the invoice sets its status to `approved`, which unlocks payment recording.
4. **Payment Recording**: Payments are initially logged in a `pending` state and do not credit the invoice until verified.
5. **Payment Settlement**: Managers approve the pending payment. An atomic **Supabase RPC Function** recalculates the invoice balance, shifts statuses to `partially_paid` or `paid`, and deducts product quantities from **Supabase Database**.

### Chain Integrity (Cascade Rejections)

Bidirectional database links trigger immediate cascades when documents are deleted or cancelled to prevent dangling states:

| Trigger                        | Effect                                                                      |
| :----------------------------- | :-------------------------------------------------------------------------- |
| Proposal deleted / cancelled   | Linked quotation (if `draft` or `sent`) is automatically set to `rejected`. |
| Quotation rejected / cancelled | Upstream proposal (if `converted`) is automatically set to `rejected`.      |
| Invoice cancelled / deleted    | Upstream quotation (if `converted`) is automatically set to `rejected`.     |

Every cascade transaction logs a `*_cascade_rejected` entry to the audit trail detailing the initiator, target, and structural reason.

---

## 4. Advanced Security & Access Control

InvoicePro Enterprise enforces bank-grade security protocols.

- **Supabase Authentication**: Secure token verification via JSON Web Tokens (JWT) issued during sign-in.
- **Dynamic Role-Based Access Control (RBAC)**: Users are validated against claims stored in their session. Roles include:
  - **Admin**: Full administrative CRUD, module configuration, and audit management.
  - **Manager**: Operational control, report exports, and workflow approval overrides.
  - **Employee**: Gated per-module view/edit capabilities mapped via `user_module_access`.
  - **Viewer**: Read-only access across standard business modules.
- **Supabase Row Level Security (RLS)**: Database tables enforce record-level isolation to prevent cross-tenant data leakage.
- **State-Change Protections**: State-altering endpoints (POST/PUT/DELETE) require verification of custom CSRF tokens (`X-CSRF-Token` headers) when utilizing cookie-based sessions.
- **Audit Trails**: Automatically logs every critical database mutation. Transactions that fail write verification are isolated in a dead-letter queue (`audit_logs_failed`) for immediate administrator inspection.
- **Encryption and Redaction**: High-value connection keys reside in environmental containers. All logging procedures automatically redact keys matching patterns such as `password`, `secret`, `token`, `api_key`, and `cookie`.

---

## 5. Universal Export Center

Every page containing business data features our premium, unified **Enterprise Export Center** dropdown. It is fully responsive, keyboard-accessible, supports dark mode, and respects permission claims.

Supported formats include:

- **High-Fidelity PDF**: Dynamically renders layout stylesheets using native system printing or backend PDFKit binaries.
- **Word Document (.docx)**: Microsoft Word compatible editable file structure.
- **Excel Workbook (.xlsx)**: Formatted table with gridlines, custom cell borders, and proper number formats.
- **CSV & XML**: Raw structured data schemas.
- **JSON & Markdown**: Developer-friendly data and document payloads.
- **Print View & Copy**: Pre-formatted layout views and quick-paste clipboard copies.
- **Google Workspace Export**: Exports Google-compatible DOCX and XLSX templates that parse directly in Google Docs and Google Sheets.

---

## 6. Performance Features

InvoicePro Enterprise is engineered for high-concurrency operations:

- **Database Optimizations**: Indexing structures optimize lookups on frequently queried columns (`invoices.status`, `payments.approval_status`).
- **Supabase RPC Optimization**: Relational calculations occur close to the data engine in atomic transactions, reducing network round-trips.
- **Pagination & Caching**: List endpoints leverage query offsets and browser-side state caching to eliminate redundant backend queries.

---

## 7. Deployment & DevOps

### Infrastructure Environments

- **Cloud/SaaS**: Fully ready for deployment on **AWS**, **GCP**, or **Azure** containers.
- **Containerization**: Includes a pre-configured multi-container `docker-compose.yml` defining services, volumes, and networks.
- **PaaS Deployments**: Ready for automated git-triggered builds on **Vercel** (Frontend) and **Railway/Render** (Backend).
- **Auto-Scaling**: Statless architecture enables container multiplication behind a load balancer (e.g. Nginx, ALB).

### Setup and Prerequisites

- **Node.js**: Version 18 LTS or newer.
- **Package Manager**: npm (bundled with Node).
- **Managed Database**: An active **Supabase** project instance.

---

## 8. Developer Quick Start

### 1. Environment Configuration

Create environmental config containers in both the backend and frontend folders:

**Backend (`backend/.env`):**

```env
PORT=8000
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-jwt-secure-signing-secret
RESEND_API_KEY=your-resend-key
FROM_EMAIL=billing@your-verified-domain.com
ENABLE_HTTPS=true
```

**Frontend (`frontend/.env.local`):**

```env
NEXT_PUBLIC_API_URL=https://localhost:8000
```

### 2. Dependency Installation

Initialize the dependencies for both services:

```bash
# Run inside backend/ folder
npm install

# Run inside frontend/ folder
npm install
```

### 3. Database Migrations

Database schemas and configurations reside in chronological files inside [`supabase/migrations/`](supabase/migrations/):

| Step | Migration File                                         | Target Schema Objects                              |
| :--- | :----------------------------------------------------- | :------------------------------------------------- |
| 1    | `20260511175701_initial_schema.sql`                    | Users, products, categories, base tables           |
| 2    | `20260512130000_invoice_foundation.sql`                | Customers, vendors, invoices, items                |
| 3    | `20260512133000_invoice_validation_phase2.sql`         | Validation logs, schema validations, audit table   |
| 4    | `20260512143000_invoice_stock_control_phase3.sql`      | Stock quantities, movements, reservation functions |
| 5    | `20260522120000_billing_payments_phase4.sql`           | Billing metrics, payments, resend email logs       |
| 6    | `20260522130000_users_roles_phase5.sql`                | Seeded Admin, Manager, Accountant roles            |
| 7    | `20260522140000_inventory_quotations_proposals_phase6` | Quotes, proposals, conversion mapping              |
| 8    | `20260522150000_convert_rpcs_phase7.sql`               | Document conversion RPC execution functions        |
| 9    | `20260522160000_atomic_crud_audit_dlq_phase8.sql`      | Failed audits queue, report queries                |
| 10   | `20260522170000_workflow_roles_phase9.sql`             | Dynamic module access controls, approvals          |
| 11   | `20260522180000_legacy_roles_cleanup_phase10.sql`      | Viewer role stabilization                          |
| 12   | `20260526120000_cascade_rpcs_phase11.sql`              | Dynamic cascade rejections                         |
| 13   | `20260526140000_unified_chain_numbering_phase12`       | Invoice/Quote sequence numbering                   |
| 14   | `20260718100000_approval_tables_phase13.sql`           | Enhanced document verification                     |
| 15   | `20260718110000_perf_indexes.sql`                      | Index optimization                                 |

Deploy migrations using the Supabase CLI:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

### 4. Running the Development Servers

Start both servers locally:

```bash
# In terminal 1 (backend folder)
npm run dev

# In terminal 2 (frontend folder)
npm run dev
```

_Note: Self-signed TLS certificates generate on first startup. Proceed past the browser security warnings for `https://localhost:3000` and `https://localhost:8000/health` to synchronize TLS states._

Sign in using the pre-seeded administrator credentials:

- **Username**: `admin@enterprise.com`
- **Password**: `admin123` _(Plaintext-seeded; automatically hashed via bcrypt on first successful sign-in)._

---

## 9. Comprehensive API Reference

All requests must include a valid JWT token in the `Authorization: Bearer <token>` header or as an HttpOnly `token` cookie.

```
Authentication:
POST   /api/auth/login                       - Payload: username, password. Returns token & cookies.
POST   /api/auth/logout                      - Destroys server sessions & clear client cookies.
GET    /api/auth/me                          - Get active session information.

Invoices:
GET    /api/invoices                         - Query: status, search, from, to.
POST   /api/invoices                         - Create invoice draft.
GET    /api/invoices/:id                     - Detail invoice metrics, items, and approvals.
PUT    /api/invoices/:id                     - Update draft invoice settings.
DELETE /api/invoices/:id                     - Cancel or delete active invoice.
POST   /api/invoices/:id/approve             - Approve invoice layout to enable payment logging.
POST   /api/invoices/:id/send                - Queue Resend email with PDF invoice attachment.
GET    /api/invoices/:id/pdf                 - Stream generated PDF binary.

Payments:
GET    /api/payments                         - Retrieve payment database logs.
POST   /api/payments                         - Record new invoice payment.
POST   /api/payments/:id/approve             - Approve pending payment. Executes DB deduction RPC.
POST   /api/payments/:id/reject              - Reject pending payment logs.

Document Conversions:
POST   /api/proposals/:id/convert-to-quotation   - Convert estimate proposal to quote sheet.
POST   /api/quotations/:id/convert-to-invoice    - Convert quotation to draft billing invoice.

Reports and Logs:
GET    /api/reports/summary                  - Get overall platform KPIs.
GET    /api/reports/revenue                  - Get monthly revenue datasets.
GET    /api/reports/export                   - Parameters: type, format. Export reports.
GET    /api/audit-logs                       - Query system logs by module or user.
GET    /api/audit-logs/export                - Export audit history.

Settings and Users:
GET    /api/users                            - Get list of system users.
POST   /api/users                            - Create new user and configure module authorization.
GET    /api/company-settings                 - View organization profile info.
```
