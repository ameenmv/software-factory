# Plan: partial refunds

## Approach
Add a refunds service in the orders module that computes the remaining captured amount, calls the payment client,
and records the refund and an audit entry in one transaction. Expose it through one admin endpoint guarded by
orders.refund. The admin order page gets a refund dialog and a history list. No schema change: the refunds table
exists from the payments integration.

## Contracts
```ts
// POST /admin/orders/:id/refunds   permission: orders.refund
// headers: Idempotency-Key: <uuid>
// body:    { amount: number /* int, minor units, > 0 */, reason?: string /* <= 200 */ }
// 201:     { id, amount, createdAt, actor: { id, name } }
// 422:     { code: 'REFUND_EXCEEDS_CAPTURE' | 'REFUND_WINDOW_CLOSED' }
// 409:     { code: 'IDEMPOTENCY_CONFLICT' }
```

## Slices
| Id | Slice | Files | Depends | Parallel |
|---|---|---|---|---|
| B001 | refund schema in shared package | packages/shared/src/refund.ts (+test) | | yes |
| B002 | refunds service + endpoint | apps/api/src/orders/refunds.* | B001 | no |
| B003 | refund dialog + history on admin order page | apps/web/app/components/admin/orders/* | B001 | yes with B002 |

## Risk register
- Money: remaining amount computed in SQL inside the transaction, not from a cached value; test concurrent refunds.
- Idempotency: unique index on (order_id, idempotency_key) already exists; test a replay.
- Authz: route-level permission plus object check that the order belongs to the admin's store.

## Rejected alternatives
- Storing remaining_refundable on the order row: denormalized money drifts; computed is cheap at this volume.
