# Customer order experience verification

Reviewed on 2026-10-20 against `xenico100/real_enico` main `7f9983b`.

## Behavior

- Customer order lines expose an explicit purchased-item field allowlist. Images are enriched only from public catalog data for IDs in the authenticated customer's owned orders.
- Payment confirmation takes precedence over shipment fields. Pending bank orders show preparation after payment confirmation; confirmed orders no longer show remittance instructions.
- Customer notification metadata is limited to customer channels, event, status and time. Provider acceptance and phone submission do not imply delivery. Manual Gmail sends are not inferred.
- Shipping progresses from preparing to shipping to delivered. Outbound states require a carrier, tracking number and method-specific confirmed payment. Partial updates preserve omitted fields; repeated saves preserve the first timestamps. Raw JSON and shipment-field comparisons reject concurrent overwrites.
- Shipping history and correction revisions use the existing order JSON. Tracking corrections trigger the existing notification system. Saved order state and notification attention are returned separately.
- Reusing an earlier tracking number with an unresolved prior SMS suppresses the new SMS and requires reconciliation. Email can continue. Existing relay SQL does not include the application correction revision; no queue mutation or schema change was used to conceal that limitation.
- Carrier-owned links are provided for Korea Post, CJ and Hanjin. Unverified carriers retain copyable tracking numbers.
- Motion uses the existing library, finite opacity/transform transitions and reduced-motion behavior. No new dependency was added.

## Verification

| Check | Result |
| --- | --- |
| `npm run test:orders` | 97 passed, 0 failed |
| Node 24 full tests, including SMS worker tests | 324 total: 315 passed, 1 pre-existing failure, 8 opt-in SQL tests skipped |
| TypeScript `tsc --noEmit` | Passed |
| ESLint for all changed JS/TS files | Passed |
| Full repository ESLint | Existing `worker.mjs:26` no-assign-module-variable error remains |
| `npm run build` | Passed |
| Local production `/dev/order-preview` | HTTP 404 |
| Local production fixture image | HTTP 404 |
| Local production `/orders` shell | HTTP 200 |
| `git diff --check` | Passed |

The full-test failure is `scripts/receipt-upload-regression.test.cjs:47`: the already-disabled receipt API returns 410 while the existing test expects 413. This failure and the worker lint error were reproduced before the changes. Neither production behavior was changed to satisfy stale checks.

Node 24 is available at `/usr/local/bin/node` in the review environment. Node 26 does not support the existing storefront test's `stripTypeScriptTypes({ mode: 'transform' })` harness. Full suite command:

```sh
/usr/local/bin/node --test scripts/*.test.cjs scripts/skt-sms-worker/*.test.mjs
```

## UI review

Run `npm run dev -- --hostname 127.0.0.1 --port 3149` and open `/dev/order-preview`. The route uses the real customer card/list-state components with synthetic data and synthetic SVG product images. It does not log in, mint a token or call order APIs. Analytics skips this exact preview path. Both page and image return 404 outside development.

Browser review covered 1440px desktop, 390px mobile and 320px narrow mobile: pending, confirmed, shipping, delivered, cancelled, notification failure, unknown carrier, loading, error and empty states. Images loaded, no horizontal overflow was observed, Enter expanded the details, retry returned to the fixture card, and tracking copy success disappeared when the tracking number changed. Screenshots are retained in the task's `evidence` directory and visibly identify the fixture.

Reduced motion was verified by rendering the actual component with a mocked reduced-motion hook and checking disabled initial movement, zero transition duration and zero stagger. The CSS media rule was reviewed. The browser's OS reduced-motion setting was false; an actual OS preference switch and low-end physical-device testing were not performed. No interaction video was recorded.

## Boundaries and handoff

No production database requests, customer impersonation, token generation, real notification sends, migrations or permission changes were performed. Live DB validation remains unavailable under the existing access denial. Unit/integration tests use mocks and synthetic fixtures.

Main push and remote deployment are on hold under the user's latest instruction. At the last fetch main remained `7f9983b`. The concurrent Kakao chat worktree currently changes `InfoPopup.tsx`, which this change does not modify. Re-fetch and compare again before any authorized future push; preserve both changes and rerun checks after integration. Do not force push.
