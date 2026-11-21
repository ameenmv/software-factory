# Intake: 001-partial-refunds

## Request
> "Support keeps asking engineering to refund half an order by hand in the database. Can admins do it from the dashboard?"
> (Head of support, ticket OPS-212)

## Who it is for and why now
Store admins with the orders.refund permission. Support handles about 40 partial refunds a month by
escalating to an engineer, at roughly 20 minutes each, and every manual database edit skips the audit log.

## Constraints
- The payment provider supports partial refunds on a capture; multiple refunds per capture are allowed.
- Money is stored as integer minor units (cents). No floats anywhere.
- Every refund must write an audit log entry.

## Non-goals
- Refunds initiated by customers.
- Refunding shipping separately from items.
- Refunds on orders that were never captured (those are voids, a separate feature).

## Open questions
- Can a refund be issued on an order older than 90 days? (Provider limit is 180.)
