-- An account that never confirmed its email can't sign in, but it still reserves the email address and the
-- @username. Remove those after 2 days (someone who tries again just signs up again).
select cron.schedule(
  'unconfirmed-accounts-expire', '41 3 * * *',
  $$ delete from auth.users where email_confirmed_at is null and created_at < now() - interval '2 days' $$
);
