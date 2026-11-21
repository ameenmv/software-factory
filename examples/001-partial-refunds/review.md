# Review: 001-partial-refunds

## Free first pass (2026-11-03, unverified)

- [x] UNVERIFIED high  apps/api/src/orders/refunds.service.ts:41  Remaining amount read before the transaction; two concurrent refunds can both pass.  -> CONFIRMED. Moved the SUM into the transaction with SELECT ... FOR UPDATE on the capture; T004 test now fails without it.
- [x] UNVERIFIED med   apps/web/app/components/admin/orders/AdminOrdersRefundDialog.vue:58  "Amount converted with parseFloat".  -> REJECTED. It parses the display string through toMinorUnits() from shared, which is integer-safe; see money.ts:30.

## Reviewer

- [x] CONFIRMED med  apps/api/src/orders/refunds.controller.ts:22  Idempotency-Key header is optional; a missing key disables replay protection.  -> fixed: header required, 400 when absent, test added.
- [x] CONFIRMED low  apps/web/app/components/admin/orders/AdminOrdersRefundHistory.vue:14  Empty state renders nothing when there are no refunds.  -> fixed: i18n empty-state message.

## Security

- [x] CONFIRMED high  apps/api/src/orders/refunds.controller.ts:30  Permission checked, but the order is not scoped to the admin's store; an admin of store A can refund an order of store B by id.  -> fixed: findOrderForStore(), 404 for foreign orders, test added.

Security verdict: pass
Verdict: accept after fixes
