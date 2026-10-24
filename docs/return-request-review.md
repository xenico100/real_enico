# Customer return requests

The member order card now shows a return entry for a confirmed-payment, delivered order. Normal online intake is available for seven days after the recorded delivered timestamp. Missing/invalid dates and elapsed windows retain a customer-support entry, including defects or incorrect items. This is an intake decision; it does not determine the final refund or statutory remedies.

The authenticated member endpoint checks verified identity and immutable customerUserId ownership, rechecks payment and delivery conditions, bounds the reason to 1,000 characters, blocks duplicates and uses a comparison of owner, payment, shipping, delivered time and raw payload to reject concurrent updates. Only raw_payload.returnRequest and updated_at change. It never cancels payment, refunds, changes shipment state or dispatches messages.

The buyer receives only eligibility/status/date. The request text is returned to authenticated primary administrators in a read-only intake list on the normal storefront My Page overview. Its API filter loads pending requests independently of the most recent general orders. The existing external unified admin remains the order/payment management destination. Approval, collection, return completion and refund processing remain manual; this change adds intake and visibility only.

## Verification

- Order and security regression suites cover ownership, state policy, duplicate/concurrent writes, request bounds, safe projections, administrator-only intake and existing notification behavior.
- Actual customer components were inspected on desktop and a 390px viewport using /dev/order-preview synthetic fixtures. Return form, required reason, disabled blank submission, pending state and elapsed-window contact entry were checked. No real order API was invoked by the fixture.
- The preview page and fixture images remain development-only and return 404 in production.
- TypeScript, changed-file ESLint and production build passed. Full ESLint retains the baseline worker.mjs no-assign-module-variable error and CartOverlay callback-dependency warning, unrelated to returns.

## Release boundary

No real return request, refund, payment cancellation or order deletion is part of verification. Live buyer order verification requires a normal authorized account; never generate a buyer session or replace the immutable ownership check. The existing administrator delivered-status action may dispatch its configured normal delivered notifications; saving an order is separate from confirming notification delivery or carrier delivery.
