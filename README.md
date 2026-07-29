# Baytna

Baytna is a marketplace for Omani home businesses and homemade food. This branch contains the
standalone full-stack Store-owner portal alongside the separately owned Customer experience.

## Stack

- Vanilla HTML, CSS, and browser JavaScript
- Node.js native HTTP server
- SQLite through Node's built-in `node:sqlite` module, or PostgreSQL through `pg`
- Argon2id password hashing
- Native Node test runner
- ESLint and Prettier as development-only dependencies

The server hosts the website and `/api/v1` from the same origin. See
[`docs/architecture.md`](docs/architecture.md) for the decision, boundaries, directory structure,
and API response contract.

## Requirements

- Node.js 24 or newer
- npm

No separate database installation is required for the default SQLite development setup.

## First-time setup

Install the development tools:

```sh
npm install
```

Create your local environment file:

```sh
cp .env.example .env
```

Replace `BAYTNA_SESSION_SECRET` in `.env` with a private random value containing at least 32
characters. Never commit `.env`.

## Run the full website

Start the development server:

```sh
npm run dev
```

Then open `http://127.0.0.1:8000`.

The server creates the local SQLite database under `data/` and serves the existing frontend. File
changes restart the Node process automatically.

To run without file watching:

```sh
npm start
```

## Supabase/PostgreSQL

The Store portal can use PostgreSQL without changing or replacing tables belonging to another
application in the same database. Its tables and migration history live in the isolated
`store_portal` schema; existing `public.users`, `public.listings`, `public.orders`, and
`public.order_items` tables are not used or modified.

For a persistent Node server, copy the direct connection string from Supabase when IPv6 is
available, or the Session pooler string when IPv4 is required. In `.env`, comment out
`BAYTNA_DATABASE_PATH` and set:

```sh
BAYTNA_DATABASE_URL=postgresql://...
BAYTNA_DATABASE_CA_PATH=/absolute/path/to/prod-supabase.cer
```

Do not commit or share the connection string. Prefer a dedicated PostgreSQL login with only the
permissions the Store service needs. A privileged migration connection can be supplied separately
as `BAYTNA_MIGRATION_DATABASE_URL`. Download the project CA certificate from the Supabase
Database SSL Configuration screen and point `BAYTNA_DATABASE_CA_PATH` to that local file so the
server verifies the certificate chain and hostname.

Coordinate with the database owner, then apply the additive Store migration explicitly:

```sh
npm run db:migrate:postgres
```

The application never applies PostgreSQL migrations during normal startup. After the migration
completes, start the server and check database readiness:

```sh
npm start
curl http://127.0.0.1:8000/api/v1/health
```

Connecting the Store portal to customer-owned tables or translating customer orders into
Store-fulfillment orders is a separate integration and is intentionally not performed by this
migration.

## Supabase document storage

The **Documents** page stores verification-file metadata in the existing
`store_portal.business_documents` table and file contents in a private Supabase Storage bucket in
the same project. The application does not create a project, database, or bucket automatically.

In the existing Supabase project, use an existing private bucket or coordinate with the project
owner to create one. Configure the server with:

```sh
BAYTNA_SUPABASE_URL=https://PROJECT_REF.supabase.co
BAYTNA_SUPABASE_SECRET_KEY=sb_secret_...
BAYTNA_SUPABASE_DOCUMENTS_BUCKET=store-documents
```

The secret key must remain server-only and must never be placed in browser JavaScript or committed.
A legacy JWT service-role key can instead be supplied as `BAYTNA_SUPABASE_SERVICE_ROLE_KEY` during
key migration. Set only one server key. The server accepts PDF, JPEG, and PNG documents up to 5 MB,
checks their file signatures, generates owner-prefixed random storage keys, and checks the
authenticated business before listing or downloading a document. The bucket must remain private.

## Authentication

The Store authentication UI at `/pages/store/login.html` supports **Sign in** and **Create
account** modes. Store registration and sign-in use Argon2id password hashes and server-managed,
HTTP-only session cookies. Select **Store** to create an owner account and continue to the
standalone owner dashboard.

Customer authentication and customer-facing pages are maintained separately by the Customer
application team.

## My Business

After signing in as a Store owner, open **My business** in the sidebar. Owners can persist:

- Business name and description
- Contact email and phone
- Address, governorate, wilayat, and service areas
- Weekly operating hours
- Temporary closure status and customer message

Completed profiles can be submitted for platform review. Owners can view their application status
but cannot approve, reject, or suspend their own business. All My Business requests resolve the
business through the authenticated session; the browser does not provide a trusted business ID.

## Menu

The Store **Menu** page supports:

- Store-owned categories with safe rename and deletion rules
- Default categories for new and existing local Stores
- Dish creation and editing
- Integer-baisa prices displayed with three OMR decimal places
- Draft, active, unavailable, and archived states
- Search, category/status filters, sorting, and pagination
- CSRF-protected mutations and cross-business ownership checks

Dish images are intentionally deferred until upload storage is selected.

## Orders

The Store **Orders** page provides an owner-scoped fulfillment workflow:

- Order-number search, status/date filters, sorting, and pagination
- Order details with item and price snapshots
- Only the customer name, phone, and delivery address needed for fulfillment
- Controlled acceptance, preparation, readiness, completion, rejection, and cancellation
- Required reasons for rejection and cancellation
- Transactional history, audit records, CSRF protection, and ownership checks

Orders will appear automatically after this Store backend and the customer backend are connected to
the same hosted database. While this branch uses local SQLite, test orders must be inserted locally;
this branch does not create customer orders.

## Profile & Settings

The minimal personal-account page lets a Store owner update their full name and change their
password. The login email is read-only until email verification is implemented. Password changes
verify the current password, preserve the current session, invalidate other sessions, and write an
audit event. A compact Dark mode On/Off control appears at the top-left of Profile & Settings; its
choice is saved in the current browser and applied across the Store portal. Business-facing
information remains under **My Business**.

## API

Check server and database readiness:

```sh
curl http://127.0.0.1:8000/api/v1/health
```

A healthy response uses the shared API contract:

```json
{
  "success": true,
  "data": {
    "database": "ok",
    "service": "baytna-store-portal",
    "status": "ok",
    "timestamp": "2026-01-01T00:00:00.000Z"
  }
}
```

## Quality checks

```sh
npm run lint
npm test
npm run format:check
```

Apply formatting with:

```sh
npm run format
```

## Environment variables

| Variable                           | Required | Description                                                           |
| ---------------------------------- | -------- | --------------------------------------------------------------------- |
| `NODE_ENV`                         | No       | `development`, `test`, or `production`                                |
| `HOST`                             | No       | Address to bind; defaults to `127.0.0.1`                              |
| `PORT`                             | No       | HTTP port; defaults to `8000`                                         |
| `BAYTNA_DATABASE_PATH`             | Choice   | SQLite path; mutually exclusive with database URL                     |
| `BAYTNA_DATABASE_URL`              | Choice   | Server-only PostgreSQL URL; mutually exclusive with SQLite path       |
| `BAYTNA_DATABASE_CA_PATH`          | No       | Local CA certificate used for strict PostgreSQL TLS verification      |
| `BAYTNA_MIGRATION_DATABASE_URL`    | No       | Optional privileged URL used only by the PostgreSQL migration command |
| `BAYTNA_SUPABASE_URL`              | Group    | Existing Supabase project URL used by private document storage        |
| `BAYTNA_SUPABASE_SECRET_KEY`       | Group    | Preferred server-only key used by the document storage adapter        |
| `BAYTNA_SUPABASE_SERVICE_ROLE_KEY` | Group    | Legacy alternative to the Supabase secret key                         |
| `BAYTNA_SUPABASE_DOCUMENTS_BUCKET` | Group    | Existing private bucket for Store verification documents              |
| `BAYTNA_SESSION_SECRET`            | Yes      | Private value containing at least 32 characters                       |

Exactly one runtime database setting is required. The server validates configuration before
binding to the port and refuses to start when required values are missing or unsafe. Supabase
Storage variables are optional as a group, but the Documents API reports unavailable until all
three are configured.
