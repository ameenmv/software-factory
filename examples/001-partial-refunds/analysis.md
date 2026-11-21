# Analysis: partial refunds

| Check | Result |
|---|---|
| Every FR has a task | FR1 T001/T005, FR2 T002, FR3 T002, FR4 T002 |
| Every acceptance scenario has a test or verify step | US1.1 T002+verify, US1.2 T001+T005, US1.3 T003+verify, US2 T006+verify |
| Plan contracts match spec | yes |
| Unowned risk | none |

CRITICAL: 0
HIGH: 0
MEDIUM: 1 - FR3 window check had no task; added to T002.
