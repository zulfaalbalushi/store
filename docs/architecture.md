# Architecture

## Decision

Baytna uses a minimal JavaScript stack:

- **Frontend:** the existing vanilla HTML, CSS, and browser JavaScript
- **Server:** Node.js using the native `node:http` APIs
- **Database:** SQLite using Node's built-in `node:sqlite`, or PostgreSQL using `pg`
- **Password hashing:** Argon2id through the maintained `argon2` package
- **Tests:** the native `node:test` runner
- **Development tools:** ESLint and Prettier

The Node server owns the API and serves the frontend from the same origin. This avoids a
separate frontend build and CORS configuration while the Store-owner portal is in its initial
stage.

## Why this stack

- It preserves the existing frontend instead of rewriting it.
- Argon2 is the only third-party production dependency and is used instead of custom password
  cryptography.
- A single process runs the website and API locally.
- SQLite remains simple for isolated local development, while PostgreSQL supports a shared hosted
  environment and concurrent writers.
- Server, domain, and data-access modules remain separate so the database can be replaced later
  without rewriting page code or business rules.

SQLite is not intended to support an unlimited number of concurrent writers. Hosted or
multi-server deployments should use PostgreSQL.

## Database boundary

SQLite migrations retain the original unqualified table names. PostgreSQL migrations create and
use a dedicated `store_portal` schema. The PostgreSQL connection sets its search path to
`store_portal,public`, so Store queries resolve to Store-owned tables first.

This permits the Store portal to use a Supabase project that already contains customer-team tables
in `public` without name collisions or accidental reads and writes. Sharing identities, listings,
or orders across those schemas requires a separately reviewed contract and migration.

PostgreSQL migrations are explicit (`npm run db:migrate:postgres`) and are never run during
application startup. This prevents an application restart from unexpectedly changing a shared
database.

## Directory structure

```text
css/                 Shared and page-specific styles
data/                Local SQLite databases (ignored by Git)
docs/                Architecture and operational documentation
images/              Public image assets
js/                  Browser JavaScript
pages/               Public HTML pages and partials
server/
  api/                API routing
  auth/               Password, session, CSRF, and rate-limit services
  business/           Ownership-scoped My Business domain service
  config.js          Environment validation
  database/           SQLite/PostgreSQL connections, migrations, and schemas
  documents/          Owner-scoped document validation and metadata
  storage/            Private Supabase Storage adapter
  index.js           Process entry point
  app.js             HTTP request handler
  http/              HTTP errors and JSON response helpers
  static.js          Safe static-file serving
tests/               Automated server tests
```

The first migration creates Store owners, businesses, operating details, menu resources, orders,
sessions, and Store-scoped audit events. See `docs/data-model.md`.

## Document storage boundary

Verification-file metadata belongs to the Store-owned `business_documents` table. File contents
live in a private bucket in the same Supabase project as the configured PostgreSQL database. The
Node server is the only Storage client: it validates the Store session and business ownership,
uses owner-prefixed random object keys, and proxies authenticated downloads. The service-role key
never reaches the browser.

The bucket is an explicitly provisioned shared-project resource. Application startup never creates
or modifies Supabase projects, databases, schemas, buckets, or Storage policies.

## API contract

Successful JSON responses use:

```json
{
  "success": true,
  "data": {}
}
```

Failed JSON responses use:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Safe explanation for the client"
  }
}
```

Validation errors may include a `details` object containing field-level messages. Internal errors
must be logged server-side without exposing stack traces, database errors, configuration values,
or secrets to clients.

## Configuration

Runtime configuration comes from environment variables and is validated before the server binds
to a port. Local development may load `.env`; production must provide variables through the
deployment environment.

The application must not silently start with a weak or missing session secret.
