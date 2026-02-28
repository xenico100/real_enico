# Random Chat Setup

1. Open Supabase SQL Editor.
2. Paste and run `/supabase/random_chat_all_in_one.sql` (or run it via migrations).
3. Confirm `pg_cron` is enabled for this Supabase project.
4. Ensure frontend env vars are set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. In Supabase Auth > Providers, enable **Anonymous** sign-ins.
