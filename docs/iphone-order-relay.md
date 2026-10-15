# iPhone order message relay

The iPhone runs this relay. The Mac is used only to sign the public, credential-free shortcut template. The phone and Mac do not need to be nearby during order handling. This uses the phone's Messages app, which may choose iMessage or carrier SMS/MMS/RCS according to the device, recipient, and carrier. It does not make carrier messages free; the existing plan and its business/automated messaging terms apply.

## One-time iPhone setup

1. Open the protected administrator page on the iPhone and generate a device connection key. Copy it. Download the signed `ENICO VECK 문자 발송` shortcut and paste the key into its setup question. Do not share the populated shortcut.
2. Add the order notification mailbox to Apple's built-in Mail app. The Gmail app alone does not provide the Apple Mail email automation trigger.
3. In Shortcuts, create a personal automation for **Email**. Select sender `orders@mongsangin.life`, subject containing `[ENICO PHONE]`, and the correct mailbox. Choose **Run Immediately** and run the shortcut `ENICO VECK 문자 발송`. Menu labels can vary with iOS versions.
4. Create the protected administrator's **self test** job and run the shortcut manually once. Allow the network and Messages permissions requested by iOS. Then repeat with the phone locked and the email automation enabled. A message to the same iPhone number can use iMessage and does not verify carrier delivery to an Android recipient.
5. Activate customer dispatch only after the real device test succeeds. Check that the phone has a working mobile service and internet connection, and allow Mail background operation.

Personal automations are specific to the iPhone and do not sync from a Mac. Their final creation/permission approval must be performed on that iPhone. There is no installed phone relay until these steps and the test have happened.

## Mail timing

Use Push when supported by the mailbox. If Push is unavailable, select an appropriate Fetch schedule (for example 15 minutes). The default **Automatically** setting can fetch in the background only while charging and connected to Wi-Fi. Gmail through Apple Mail can be delayed; this design does not guarantee instant order texts. A queued job remains visible to the operator while waiting for the phone.

## Queue protocol and delivery status

The email contains no authoritative recipient or message instructions; it only wakes the shortcut. The shortcut ignores all email/shortcut input and calls only these fixed URLs with the device key in the `Authorization: Bearer …` header:

- `POST https://enicoveck.com/api/phone-relay/claim` returns `{ job: null }` or `{ job: { id, claimToken, to, text, title, kind } }`.
- `kind` must be `customer_sms` or `self_test`. The shortcut shows an owner notification, submits the message through Messages, then calls `POST /api/phone-relay/ack` with `{ jobId, claimToken, status: "submitted" }`.
- Each invocation claims at most 10 jobs and waits three seconds after each acknowledgment to respect the per-device claim limit. An empty queue stops immediately. Overlapping invocations depend on the server's atomic claims; a claimed job must not be automatically replayed after an interruption.
- `submitted` means the Messages action returned normally. There is no carrier delivery receipt. An interrupted or ambiguous job requires operator review in Messages before any manual retry, to prevent duplicate customer messages.

## Build and sign

`src/lib/orders/phoneRelayShortcut.ts` exports a pure XML generator and a structured document generator. Its default output contains only `PASTE_DEVICE_TOKEN_HERE` plus an import question bound to action index zero. Only this default template is suitable for publication/signing. The optional token argument exists for a protected local export if needed; never publish or send a populated device file to a third-party signer.

On macOS:

```sh
plutil -lint ENICO-VECK-unsigned.shortcut
shortcuts sign --mode anyone --input ENICO-VECK-unsigned.shortcut --output ENICO-VECK.shortcut
```

Apple receives a copy of a shortcut when it is signed. Do not put a live device credential in the source submitted to signing. XML parsing and server-side regression tests cannot verify iOS execution, import rendering, locked-device behavior, or actual carrier delivery; those require the device test above.

Primary references:

- [Apple: signing shortcuts from the command line](https://support.apple.com/en-au/guide/shortcuts-mac/apd455c82f02/mac)
- [Apple: communication triggers](https://support.apple.com/guide/shortcuts/apdd711f9dff/ios)
- [Apple: personal automations are specific to a device](https://support.apple.com/guide/shortcuts/apd690170742/ios)
- [Apple: Mail Push and Fetch settings](https://support.apple.com/en-us/102578)
- [Cherri compiler source: import-question structure](https://github.com/electrikmilk/cherri/blob/main/shortcutgen.go)
- [Cherri compiler source: Match Text action keys](https://github.com/electrikmilk/cherri/blob/main/actions_std.go)
