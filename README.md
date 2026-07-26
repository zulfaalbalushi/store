# Baytna

Baytna is a marketplace for Omani home businesses and homemade food. This branch contains the
standalone full-stack Store-owner portal and the shared Customer/Store authentication entry point.

## Stack

- Vanilla HTML, CSS, and browser JavaScript
- Node.js native HTTP server
- SQLite through Node's built-in `node:sqlite` module
- Argon2id password hashing
- Native Node test runner
- ESLint and Prettier as development-only dependencies

The server hosts the website and `/api/v1` from the same origin. See
[`docs/architecture.md`](docs/architecture.md) for the decision, boundaries, directory structure,
and API response contract.

## Requirements

- Node.js 24 or newer
- npm

No separate database installation is required for local development.

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

## Authentication

The authentication UI supports **Sign in** and **Create account** modes. Store registration and
sign-in use Argon2id password hashes and server-managed, HTTP-only session cookies. Select
**Store** to create an owner account and continue to the standalone owner dashboard.

Customer access remains a development placeholder until the customer application and its
server-side authentication are implemented.

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

| Variable                | Required | Description                                     |
| ----------------------- | -------- | ----------------------------------------------- |
| `NODE_ENV`              | No       | `development`, `test`, or `production`          |
| `HOST`                  | No       | Address to bind; defaults to `127.0.0.1`        |
| `PORT`                  | No       | HTTP port; defaults to `8000`                   |
| `BAYTNA_DATABASE_PATH`  | Yes      | Path to the SQLite database file                |
| `BAYTNA_SESSION_SECRET` | Yes      | Private value containing at least 32 characters |

The server validates configuration before binding to the port and refuses to start when required
values are missing or unsafe.
