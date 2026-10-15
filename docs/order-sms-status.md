# Order SMS status contract

The protected `GET /api/admin/orders` response and successful order mutation
responses project authoritative private queue metadata into
`order.notifications.channels.customerSms` and every corresponding
`order.notificationHistory[].channels.customerSms`.

Existing `status`, `providerId`, `attemptedAt`, and `errorCode` fields remain.
Relay records also expose these safe fields:

```ts
{
  provider: 'phone_relay';
  jobId?: string;
  status: 'queued' | 'claimed' | 'submitted' | 'unknown' | 'stale';
  queuedAt: string | null;
  claimedAt: string | null;
  submittedAt: string | null;
  resultUpdatedAt: string | null;
  expiresAt: string | null;
  reasonCode: string | null;
  deliveryConfirmed: false;
}
```

`submitted` means the client reported that its send action was accepted. It is
not a carrier delivery receipt. A queued job whose deadline has passed is shown
as `stale`; an expired claim is shown as `unknown`. These are read projections,
not writes to order/payment JSON or the queue. Unknown/expired jobs are not resent.

Queue records are matched by the exact immutable order ID and event key. An
existing provider ID must also match. This safely reconciles an enqueue whose
response was lost without exposing another order's job metadata. Queries select
only IDs, state, and timestamps; recipients, message text, hashes, credentials,
and claim capabilities are never returned in this view. Each event-key query is
bounded to 100 unique events to avoid silent row-limit truncation.

Reason codes include `PHONE_RELAY_EXPIRED`, `PHONE_RELAY_CLAIM_EXPIRED`,
`PHONE_RELAY_RESULT_UNKNOWN`, `PHONE_RELAY_STALE`, and
`PHONE_RELAY_STATUS_UNAVAILABLE`. Missing/unavailable metadata is never presented
as a confirmed send or successful handset delivery.

## Payment wording

`notificationMessage.ts` contains the shared pure builder:

- Bank transfer pending: order ID, exact total, bank/account/holder, and explicit
  pending status. Creating the order does not imply payment.
- Bank transfer confirmed: remittance acknowledgement, no request to pay again.
- NICE card payment: card-approved wording only after the server persists the
  verified `paid` result. The approval route still verifies amount, transaction,
  order, currency, goods name, and approval signature before dispatch.
- Pending, approval-processing, mismatched payment method/state, cancelled, and
  refund states do not dispatch a payment-complete message.

Notification failure never retries a payment or changes financial state. Existing
CAS claims, durable event-key deduplication, and cancellation checks remain active.

## Owner-only template tests

The existing primary-owner-only `POST /api/admin/phone-relay` accepts these actions:

```json
{"action":"self_test_bank"}
{"action":"self_test_card"}
```

The receiver is always server-configured `ADMIN_NOTIFICATION_PHONE`. Caller-supplied
recipients or message text are not accepted. The shared builder supplies sample
copy prefixed `[테스트 · 실제 주문/결제 없음]` and a reminder not to remit money.
The queue kind is `self_test`, with no order ID or financial row/inventory change.
No synthetic card approval or actual card transaction is recorded.

`GET /api/admin/phone-relay` includes the five latest `recentSelfTests` for the active
device. Each contains the safe delivery metadata above, `id`, and `testType`:
`bank_transfer`, `card`, or `connection`. A harmless type marker in the existing
43-character self-test event key survives terminal message scrubbing. No schema
change is required.

Acknowledgements retain their authenticated capability checks and append only
job ID/state to server logs. They return `deliveryConfirmed:false`. This code's
regression tests use mocks and cannot prove physical SMS receipt.

## Live validation — 2026-10-15 (KST)

Both the storefront API and unified administrator were released to their production domains. Bank-transfer and card template tests targeted the owner alone; no financial orders, card approvals, inventory changes, or other customer sends were created.

The bank MMS was verified against SKT's individual sent-message ID, status 00, full 338-character body and quota decrement. Its first readback raced the AJAX skeleton; the job was reconciled to submitted after manual inspection, with a manualReview audit retained in that test row. The driver now waits for quota, conversation and detailed-message readiness. The card test then passed queue claim → SKT send → detailed-history proof → authenticated acknowledgement automatically. Remaining free quota was 97. Physical receipt of the earlier connection SMS was confirmed by the owner; these two template sends still have no carrier delivery receipt.

The Mac LaunchAgent polls every 30 seconds. Three consecutive empty-queue checks exited successfully before final sender configuration cleanup; a post-cleanup check also runs before handoff. Dispatch requires the Mac, dedicated browser session and remaining free allowance. Quota exhaustion or login failure pauses before claiming; ambiguous outcomes block retries. The sender and device credential are private runtime configuration.

Validation passed: 97 payment regressions, 21 relay/shortcut regressions, 68 worker tests, 65 targeted administrator tests, type checks and production builds. Eight optional SQL harness cases were skipped; live queue claim/ack and private status queries were exercised above.
