# Retired SMS connection feature

The owner retired SMS/phone-relay on 2026-11-04. Pairing, claim and acknowledgement endpoints now return HTTP 410 without authentication, database, email or provider calls. The unsigned generator and downloadable Shortcut were removed.

Checkout and order transitions still send administrator/customer email. Existing explicitly configured Kakao Alimtalk remains independent, with SMS replacement disabled. SMS channels cannot be selected for dispatch or administrator retry, and the provider adapter rejects SMS even if legacy credentials remain configured.

Order payment/notification JSON is preserved. Without querying the retired queue, queued work is shown as skipped, while claimed or sending work remains unknown because it may already have reached the old device. Terminal history is retained and never implies carrier delivery. Signup notification relay is a separate feature and remains operational.

The historical setup SQL is retained for provenance only and must not be re-applied. The reviewable [retirement SQL](../sql/phone_relay_retire.sql) has **not been applied** because the current Enico management connector returns INVALID_ARGUMENT. Before execution, verify the project identity, aggregate counts/sizes and catalog dependencies, and confirm production serves this release. It is an explicit manual cleanup script, never an automatic build migration; it must not delete orders, members, general notifications, signup cron jobs or shared storage.
