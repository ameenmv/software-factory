# Verify: 001-partial-refunds

Environment: local dev stack, commit 3f2c9e1, payment provider sandbox.

## Scenario: US1.1 admin refunds 40.00 of 100.00
Result: pass
Evidence: output/verify/refund-partial.png; POST /admin/orders/1042/refunds 201 {"amount":4000}; audit_log row 88121 actor=admin-3; no console errors

## Scenario: US1.2 over-refund is refused
Result: pass
Evidence: output/verify/refund-exceeds.png; POST ... 422 {"code":"REFUND_EXCEEDS_CAPTURE"}; dialog shows the translated message in both locales

## Scenario: US1.3 admin without permission
Result: pass
Evidence: refund button absent for role "viewer" (output/verify/refund-viewer.png); direct POST returns 403

## Scenario: US2 refund history
Result: pass
Evidence: output/verify/refund-history.png shows two refunds with actor and time; empty state checked on order 1050

## Scenario: double click on "Refund"
Result: pass
Evidence: one POST in the network log; button disabled while pending; replay with same Idempotency-Key returns the first refund
