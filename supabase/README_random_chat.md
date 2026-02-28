# Random Chat Setup

1. Open Supabase SQL Editor.
2. Paste and run `/supabase/random_chat_all_in_one.sql` (or run it via migrations).
3. Confirm `pg_cron` is enabled for this Supabase project.
4. Ensure frontend env vars are set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. In Supabase Auth > Providers, enable **Anonymous** sign-ins.
6. If realtime events are delayed or missing, re-run the SQL so `chat_rooms`, `chat_room_members`, `chat_room_messages` are added to `supabase_realtime` publication.
7. For daily mail report visitor count, run `/supabase/site_daily_visitors_setup.sql`.
