-- Phase 0 foundation.
-- Public forms and demos now write through server functions with the service
-- role, so the anon key loses its direct insert rights. Admins can read.

-- Trigram matching for sanctions screening (Phase 2).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Admin check used by every admin policy.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- Old demo payment_requests: no more public access. The table is replaced by
-- the new payment_requests shape in Phase 2.
DROP POLICY IF EXISTS "Demo payment requests are viewable by link" ON public.payment_requests;
DROP POLICY IF EXISTS "Anyone can create a demo payment request" ON public.payment_requests;
DROP POLICY IF EXISTS "Anyone can settle a demo payment request" ON public.payment_requests;
REVOKE ALL ON public.payment_requests FROM anon, authenticated;

-- Waitlist: insert only via server function (rate limited). Admin reads.
DROP POLICY IF EXISTS "Anyone can join the waitlist" ON public.waitlist_signups;
REVOKE ALL ON public.waitlist_signups FROM anon;
REVOKE INSERT ON public.waitlist_signups FROM authenticated;
GRANT SELECT ON public.waitlist_signups TO authenticated;
CREATE POLICY "Admins read the waitlist" ON public.waitlist_signups
  FOR SELECT TO authenticated USING (public.is_admin());

-- Contact messages: same.
DROP POLICY IF EXISTS "Anyone can send a message" ON public.contact_messages;
REVOKE ALL ON public.contact_messages FROM anon;
REVOKE INSERT ON public.contact_messages FROM authenticated;
GRANT SELECT ON public.contact_messages TO authenticated;
CREATE POLICY "Admins read contact messages" ON public.contact_messages
  FOR SELECT TO authenticated USING (public.is_admin());

-- Demo transactions now also hold demo payment links, which need a memo,
-- a status and a paid time. Status is text with a check, per TRD section 2.
ALTER TABLE public.demo_transactions
  ADD COLUMN IF NOT EXISTS memo text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.demo_transactions
  ADD CONSTRAINT demo_transactions_status_check CHECK (status IN ('pending', 'paid', 'completed'));
CREATE UNIQUE INDEX IF NOT EXISTS demo_transactions_payment_link_reference_key
  ON public.demo_transactions (reference) WHERE kind = 'payment_link';
DROP POLICY IF EXISTS "Anyone can log a demo transaction" ON public.demo_transactions;
REVOKE ALL ON public.demo_transactions FROM anon;
REVOKE INSERT ON public.demo_transactions FROM authenticated;
GRANT SELECT ON public.demo_transactions TO authenticated;
CREATE POLICY "Admins read demo transactions" ON public.demo_transactions
  FOR SELECT TO authenticated USING (public.is_admin());

-- Every outbound partner call, including failed emails (partner = 'resend').
-- Created now because email logging needs it. Phase 2 adds the foreign key to
-- transactions and the business-owner read policy.
CREATE TABLE IF NOT EXISTS public.partner_calls (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  partner text NOT NULL,
  endpoint text NOT NULL,
  request jsonb,
  response jsonb,
  status_code int,
  duration_ms int,
  transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_calls_partner_created_at_idx
  ON public.partner_calls (partner, created_at DESC);
GRANT ALL ON public.partner_calls TO service_role;
GRANT SELECT ON public.partner_calls TO authenticated;
ALTER TABLE public.partner_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read partner calls" ON public.partner_calls
  FOR SELECT TO authenticated USING (public.is_admin());
