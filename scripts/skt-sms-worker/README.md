# ENICO VECK SKT SMS worker core

Dependency-free ES modules for Node 24/26. This package supplies the queue consumer,
local stop state, and tests. A real SKT browser adapter is deliberately absent until
the authenticated SKT form, free allowance, and success state are observed.

**Inactive preparation only.** No production token, phone number, customer message,
or browser selector is included. This code has not been installed, scheduled, or
connected to a live queue. It contains no real SKT browser adapter, and a real test
delivery using this worker has not occurred.

The authenticated SKT service links its [SMS terms](https://msgmgr.tworld.co.kr/html/etc/sms_agreement.php).
Section 18(3) requires SKT's prior written consent for profit-oriented business use.
Provider consent for commercial ENICO VECK order messages has **not** been verified.
Do not activate customer order dispatch until SKT has given the required written
consent and the exact free-send conditions have been verified. An existing free
allowance alone does not authorize commercial automated use.

## Browser adapter contract

Export `default { preflight, send }`, or `createAdapter()` returning that object.
An optional `close()` may disconnect the automation client without closing the user's
browser. The adapter must own a dedicated browser page and serialize its UI actions.

```js
export default {
  async preflight() {
    // Read the actual authenticated SKT UI. Unknown text is not a zero-cost proof.
    return { loggedIn: true, freeRemaining: 100 };
  },
  async send(job) {
    // job = {id, claimToken, to, text, title, kind}
    // Fill exactly one recipient and the complete message. Do not truncate it.
    // At the final submit boundary verify the correct account, visible free
    // allowance, zero additional charge and SMS/MMS mode/length compatibility.
    // Do not click if any check is unknown. After a possible click, never retry.
    // Only a positively identified submission result permits `submitted`.
    return { status: 'unknown' };
  },
};
```

The example above is an interface illustration, not an SKT implementation. Never
hard-code `loggedIn`, `freeRemaining`, or a success result in the real adapter.

## State, credentials, and running

Set an absolute adapter path in `ENICO_SKT_ADAPTER`. The default state directory is
`~/.local/state/enico-skt-sms`; override it using `ENICO_SKT_STATE_DIR`. It must be owned
by the worker user with mode 0700. State and lock files use 0600.

The device key must come from exactly one of:

- `ENICO_PHONE_RELAY_TOKEN` in the process environment; or
- `ENICO_PHONE_RELAY_TOKEN_FILE`, an absolute path to a user-owned regular mode-0600
  file. Symlinks, permissive files, multiple sources, and command-line tokens are refused.

Do not put the key in source, a shared shortcut, logs, process arguments, or a public
configuration file. A private token file is preferable for launchd configuration.

```sh
node worker.mjs
node worker.mjs --live
node worker.mjs --live --allow-customer-orders
node worker.mjs --status
```

No flags means dry run: only SKT preflight, no claim, no send, no ack. `--live` processes
at most one job and only accepts a self-test. Customer jobs require explicit
`--allow-customer-orders`, the existing server's enabled/tested state, and
`ENICO_SKT_COMMERCIAL_CONSENT_VERIFIED=true`. The last setting is an operator attestation
to set only after retaining SKT's written approval; it does not obtain or verify
consent by itself. It is intentionally unset in this preparation.

Before switching consumers, stop the iPhone automation. Do not give the same device
token to concurrently active iPhone and browser consumers. A new server pairing
revokes the old device and invalidates outstanding work; plan that switch explicitly.

No launchd task is included or registered. Any future scheduling requires a real
self-test, an unattended browser test, and SKT's written consent for commercial use.
Use a single invocation at a time if that future activation is authorized.
Every invocation rechecks SKT login/free quota before claiming and again before
calling `send`. The browser adapter must also check them at final UI submission.
Free-quota exhaustion means pause; never silently continue into charged sends.

## Ambiguous outcomes stop the worker

The consumer persists each phase before claim, send, and ack. Any interrupted phase,
invalid claim, ambiguous send, or failed acknowledgement leaves a persistent block.
Logs contain constant event/reason codes only. State contains phase/time/opaque IDs;
it never contains recipient, message, device token, or claim token.

The client never retries an HTTP request or send. After an ambiguous send it attempts
one `unknown` acknowledgement, which pauses the server relay. A submission followed
by a failed ack is blocked locally and never resubmitted. `submitted` proves only the
SKT UI accepted the submission, not customer delivery.

Inspect the SKT sent list and the server queue before resolving a block. The status
command shows the attempt ID. Explicit reset requires both environment values:

```text
ENICO_SKT_REVIEWED=true
ENICO_SKT_REVIEWED_ATTEMPT_ID=<exact blocked attempt ID from --status>
node worker.mjs --reset-after-review
```

Reset does not replay a job, clear server state, or enable customer messages. A process
crash may leave `worker.lock`. Check that the previous PID has exited and review any
in-flight SKT submission before manually removing a stale lock. Locks are never stolen.

The server contract is `POST /api/phone-relay/claim` and `POST /api/phone-relay/ack` on
the fixed `https://enicoveck.com` origin. Redirects are refused. API key material is sent
only in the Authorization header. The current server has a 30-minute job lifetime,
at most a 5-minute claim, one outstanding claim, and 20 customer messages per 24 hours.
Those limits do not implement SKT's monthly free quota: the adapter must verify SKT's
actual available free allowance every time.

## Tests

Run `node --test` or `npm test`. Core tests use an in-process fake fetch and fake
adapter; transport tests use a fake WebSocket. They never contact ENICO VECK, SKT,
or any recipient. The generic `cdp.mjs` helper connects only to loopback CDP endpoints
and supplies no SKT selectors or send workflow.
