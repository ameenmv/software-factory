# Tasks: partial refunds

- [x] T001 [B001] [P] Add refundRequestSchema and remainingRefundable() to packages/shared
- [x] T002 [B002] Add RefundsService.refund with transaction, idempotency and audit
- [x] T003 [B002] Add POST /admin/orders/:id/refunds with orders.refund permission
- [x] T004 [B002] Concurrency test: two simultaneous refunds cannot exceed capture
- [x] T005 [B003] [P] Refund dialog with amount validation and error states
- [x] T006 [B003] Refund history list on the admin order page
