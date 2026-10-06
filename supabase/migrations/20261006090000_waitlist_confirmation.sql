-- Waitlist email confirmation ("Confirm my place").
-- A sign-up only counts once the person clicks the link we email them. This
-- keeps typos, fake addresses and other people's addresses off the list, and
-- the admin lead alert now waits for that click.

ALTER TABLE public.waitlist_signups
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN confirm_token_hash text UNIQUE,       -- sha256 of the emailed token; cleared once used
  ADD COLUMN confirm_expires_at timestamptz,
  ADD COLUMN confirm_emails_sent int NOT NULL DEFAULT 0,
  ADD COLUMN last_confirm_sent_at timestamptz;

-- Everyone who joined before this change already got the old welcome email,
-- so they count as confirmed.
UPDATE public.waitlist_signups SET confirmed_at = created_at WHERE confirmed_at IS NULL;

-- Emails are now stored lower-case, so a repeat sign-up finds the earlier one.
-- Older rows may hold the same email more than once; they are kept as they are.
UPDATE public.waitlist_signups SET email = lower(email) WHERE email <> lower(email);
CREATE INDEX waitlist_signups_email ON public.waitlist_signups (email);
