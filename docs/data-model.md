# Store Data Model

All Store resources are owned through this chain:

```text
users (role = store_owner)
  └── businesses (one business per owner)
        ├── business_documents
        ├── business_hours
        ├── service_areas
        ├── categories
        │     └── dishes
        │           └── dish_images
        ├── orders
        │     ├── order_items
        │     └── order_status_history
        └── audit_events
```

API clients do not choose the active business ID. The server resolves it by joining the hashed
session token to the authenticated user and that user's business. Store queries also include the
authenticated owner ID when reading or changing the business itself.

## Sessions

Sessions contain a hash of a cryptographically random token. The original token exists only in an
HTTP-only, same-site cookie. State-changing requests also require the session's CSRF token.
Sessions expire after eight hours.

## Money

Money is stored as integer Omani baisa. One OMR equals 1,000 baisa. This avoids floating-point
rounding errors while retaining OMR's three decimal places.

## Owner-visible business statuses

- `draft`: the owner is still completing the profile
- `pending`: submitted for platform review
- `approved`: approved by the platform
- `rejected`: changes are required before resubmission
- `suspended`: platform access or operations are suspended

The Store owner can submit `draft` or `rejected` profiles, moving them to `pending`. Store APIs do
not accept `application_status` in profile updates, so an owner cannot approve, reject, or suspend
their own business.

## Dish statuses

- `draft`
- `active`
- `unavailable`
- `archived`

Dish workflow rules are enforced by the Store Menu service.

Implemented owner transitions:

- `draft` → `active` or `unavailable`
- `active` → `unavailable`
- `unavailable` → `active` or `draft`
- Any non-archived state → `archived`
- `archived` is terminal in the Store portal

## Order statuses

- `pending`
- `accepted`
- `preparing`
- `ready`
- `completed`
- `rejected`
- `cancelled`

The permitted Store-owner transitions will be enforced when the Orders module is implemented.

## Migrations

SQL migrations live in `server/database/migrations` and are applied alphabetically during server
startup. Applied filenames are recorded in `schema_migrations`. Each migration runs in a
transaction and is never applied twice.
