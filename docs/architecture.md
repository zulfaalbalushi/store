# Architecture

## Decision

Baytna uses a minimal JavaScript stack:

- **Frontend:** the existing vanilla HTML, CSS, and browser JavaScript
- **Server:** Node.js using the native `node:http` APIs
- **Database:** SQLite using Node's built-in `node:sqlite` module
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
- SQLite is sufficient for the first release and simple to back up and operate.
- Server, domain, and data-access modules remain separate so the database can be replaced later
  without rewriting page code or business rules.

SQLite is not intended to support an unlimited number of concurrent writers. Before multi-server
deployment or sustained high write volume, reassess the database and plan a migration to a managed
relational database such as PostgreSQL.

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
  database/           SQLite connection, migrations, and schema
  index.js           Process entry point
  app.js             HTTP request handler
  http/              HTTP errors and JSON response helpers
  static.js          Safe static-file serving
storage/uploads/     Local development uploads (contents ignored)
tests/               Automated server tests
```

The first migration creates Store owners, businesses, operating details, menu resources, orders,
sessions, and Store-scoped audit events. See `docs/data-model.md`.

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
