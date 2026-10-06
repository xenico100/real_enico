-- Keep browser clients read-only for messages. The bounded, rate-limited server
-- endpoint validates the authenticated sender and room membership before insert.
alter table public.chat_room_messages
  add constraint chat_room_messages_message_length_check
  check (char_length(btrim(message)) between 1 and 500);

revoke insert, update, delete on table public.chat_room_messages from anon, authenticated;
drop policy if exists messages_insert_member_v2 on public.chat_room_messages;
