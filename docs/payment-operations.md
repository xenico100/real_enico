# Payment operations and safe reconciliation

Payment providers must never be re-called merely because the browser timed out. Reconcile the provider transaction first; a failed HTTP response does **not** prove that money did not move.

## Checkout and inventory

- PayPal and NICEPAY claim each one-of-a-kind product in `payment_checkout_claims` before capture/approval. NICEPAY preparation holds the item for 30 minutes; once a provider approval/capture might begin, the claim does not expire automatically. A completed sale marks the product sold out and then releases the claim.
- An uncertain provider or database outcome keeps the claim until manual reconciliation. Before clearing a stuck claim or republishing a product, check the provider order/TID and the `orders` row. Never clear it solely to let a buyer retry.
- Bank transfer creates a `pending_transfer` order without claiming inventory. Do not represent it as paid until the actual transfer is independently verified. Admin confirmation runs `confirm_bank_transfer_order`, which atomically checks availability and active checkout claims, marks one-of-a-kind products unpublished, and moves only that order to `transfer_confirmed`. A product conflict must be handled by a human, including any necessary refund; do not simply override the status. An unpaid cancellation is `cancelled`; a confirmed transfer cancellation becomes `refund_pending` until a human verifies the refund.

## Unconfirmed states

- PayPal: the browser keeps an approved order ID in memory and retries the *same* `/api/orders/paypal` request. A page refresh discards that memory to avoid storing the guest lookup password. If the buyer cannot retry, locate the PayPal order and capture in the merchant console, then compare them with the matching pending/complete `orders` row. Do not create a second PayPal order.
- NICEPAY `approval_processing`: a signed callback reached the server and an approval call may have been sent. Check the NICEPAY TID and amount in the merchant console before deciding whether to finalize or release the order. Do not run the approval API again while this state remains.
- NICEPAY `cancel_processing`: a cancellation call may have reached NICEPAY. Check the TID and cancellation balance before changing the local order state. Do not submit another cancellation automatically.
- If a paid order is recorded but stock or notification email did not update, reconcile inventory and email separately. Do not re-charge or re-cancel the payment to repair a downstream failure.
- NICEPAY cancellation on the current production schema does not automatically republish a product because `products.raw` is absent and there is no per-order stock provenance. Verify the physical item and inventory history before an administrator republishes it. The cancelled order's checkout claim is released only after a verified full cancellation.
- Payment orders cannot be hard-deleted through the admin API. Preserve the audit trail and use a separate retention/redaction procedure for privacy requests.
- A pending bank transfer does not reserve stock or prevent a customer from sending money later. If two customers transfer for the same item, only one can be atomically confirmed; reconcile and refund the other transfer manually. Do not promise stock until confirmation. Refunded/cancelled bank stock also requires manual review before republishing.

## Configuration and verification

- Both browser and server PayPal currency/rate settings must match. With no overrides, the current code uses USD and a fixed KRW/USD rate of 1,350. Set an explicit commercial FX policy before changing it; this default is not a live exchange rate.
- `PAYMENT_RECEIPT_UPLOAD_ENABLED` is unset in the production Vercel project. Keep it disabled: the current R2 image URL is public, even though its HTTP cache header says `private`. A private-bucket delivery design is required before using receipt uploads for personal financial documents.
- Apply the four payment migrations before deploying code that calls their RPCs. The RPC functions are executable only by `service_role`, not browser roles.
- Safe checks: `npm run test:payments`, `npm run test:security`, `npx tsc --noEmit`, `npm run build`, and read-only deployment checks. These never invoke a real payment or refund. Provider sandbox calls are intentionally not part of this checklist.

Provider references: [PayPal request idempotency](https://developer.paypal.com/api/make-api-requests), [NICEPAY server-approval signatures](https://github.com/nicepayments/nicepay-manual/blob/main/api/payment-window-server.md), [NICEPAY cancellation and network cancellation](https://github.com/nicepayments/nicepay-manual/blob/main/api/cancel.md).
