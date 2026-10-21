# SOLAPI order Alimtalk

The existing order notification dispatcher now supports a separate `customerKakao` channel. No database migration is required. Claims and outcomes remain in each order's `raw_payload.notifications` using the existing compare-and-swap protection.

## Events

| Trigger | Event | Message |
| --- | --- | --- |
| Persisted bank-transfer order, still pending | `order_received` | Order received, awaiting payment, exact total and bank details |
| Bank transfer confirmed by admin / approved Nicepay / captured PayPal | `payment_confirmed` | Payment confirmed; no additional remittance |
| Admin saves shipping state with carrier and tracking | `shipping_started` | Actual saved carrier and tracking |

Cancel/refund/delivery-complete events have no approved Kakao templates in this change. They record `skipped` for Kakao while existing email processing continues. Missing shipment fields never produce invented tracking details.

## Production configuration

All variables below are server-only. Set them in the Vercel `real-enico` production environment, never in `NEXT_PUBLIC_*`, source control, or client storage. Store API credentials as sensitive/encrypted values.

| Variable | Value / requirement |
| --- | --- |
| `SOLAPI_API_KEY` | Existing authorized server API key or newly approved dedicated key |
| `SOLAPI_API_SECRET` | Corresponding secret |
| `SOLAPI_KAKAO_PF_ID` | `KA01PF261020042705372o2ciPO95foX` (에니코벡) |
| `SOLAPI_KAKAO_ORDER_RECEIVED_TEMPLATE_ID` | `KA01TP261021034400548bhUlmywSvxY` — submitted 2026-10-21; **pending Kakao review** |
| `SOLAPI_KAKAO_PAYMENT_CONFIRMED_TEMPLATE_ID` | `KA01TP261021034536932FAlmZTtzY5K` — submitted 2026-10-21; **pending Kakao review** |
| `SOLAPI_KAKAO_SHIPPING_STARTED_TEMPLATE_ID` | `KA01TP261020043741867HGUfayTVErP` — existing approved shipping template |
| `ORDER_CUSTOMER_MESSAGE_CHANNEL` | Set to `alimtalk` only after credentials, template approvals and an owner-only test are verified |

Copy in `src/lib/orders/alimtalkMessage.ts` must match the approved template body exactly. The older deposit-confirmed/shipping-date template cannot be substituted for the new order-received template.

Without the explicit `alimtalk` transport selection, existing SMS/phone-relay behavior stays in place. After selection, missing Kakao configuration, rejection or timeout never falls through to SMS/LMS or the phone relay. Requests explicitly use `type: ATA` and `kakaoOptions.disableSms: true`; a registered SMS sender is not required.

## Delivery and retries

- One durable claim per order/event/channel, including concurrent callbacks.
- A prior SMS/Kakao acceptance, queue submission or unknown outcome prevents switching transports to resend the same event.
- A network timeout, HTTP 408/5xx or malformed acceptance is `unknown`, never automatically retried. Inspect the provider log before reconciliation.
- Provider acceptance is recorded as `sent`, with `deliveryConfirmed: false`. It is not handset delivery or proof of reading. Confirm final delivery independently in SOLAPI message logs (4000).
- The admin-only `/api/admin/notifications` returns masked configuration readiness; it does not verify balance, key validity or template approval. Customer views expose only channel/status/event/time.
- Order save/payment success is retained even if notifications fail. No old orders are replayed automatically.

## Activation verification

1. Confirm both new templates are approved in the 에니코벡 channel.
2. Authorize and configure the dedicated API credentials in production; keep them out of logs.
3. Use a clearly marked synthetic message to the owner's authorized test number. Verify `ATA`, `disableSms: true`, the selected template and final provider status, without creating a real charge/order or messaging historical customers.
4. Set the production transport to `alimtalk`, redeploy, then verify the authenticated configuration endpoint. Keep existing phone-relay jobs intact; accepted older events are not resent.

Implementation verification: `npm run test:payments`, `npm run test:orders`, targeted ESLint and `npm run build`. Provider and database tests use isolated in-memory fixtures and never transmit real customer data.

Official references: [message API](https://solapi.com/developers/api/messages), [SMS replacement](https://solapi.com/developers/api/messages-disablesms), [authentication](https://solapi.com/developers/api/authentication).
