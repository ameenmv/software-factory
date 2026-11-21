# Spec: partial refunds

## User stories

### US1 (P1): Admin issues a partial refund
As an admin with orders.refund, I refund part of a captured order so the customer gets the right amount back
without an engineer.

Acceptance scenarios:
1. Given an order captured for 100.00 with no refunds, when I refund 40.00, then a refund of 40.00 is recorded, the
   order shows 60.00 refundable, and an audit entry names me.
2. Given an order with 60.00 refundable, when I refund 70.00, then nothing is refunded and I see "Refund exceeds the
   remaining captured amount".
3. Given I lack orders.refund, when I open the order, then I do not see the refund action, and a direct API call
   returns 403.

### US2 (P2): Admin sees refund history
As an admin, I see every refund on an order with amount, time and who issued it.

## Functional requirements
- FR1: refund amount is a positive integer in minor units, at most the remaining captured amount.
- FR2: refunds are idempotent per client request key; a retried request does not refund twice.
- FR3: refunds are allowed up to 180 days after capture (clarified: provider limit, no business limit).
- FR4: every refund writes an audit entry with actor, order, amount and provider reference.

## Success criteria
- Zero manual database refunds after release.
- A partial refund takes an admin under one minute.
