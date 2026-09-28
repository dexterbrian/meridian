-- Payaza hackathon build: the collection half of Meridian.
-- Tables are the hackathon subset of TRD section 2, with the same names and
-- columns, so the full MVP adds around them instead of replacing them.
-- Statuses are text with a check, not enums, so they can change without a
-- type migration. Money is numeric(18,2). Nothing here is ever hard-deleted.

-- Keeps updated_at honest on every table that has one.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

/* -------------------------------- businesses ------------------------------- */
-- Profile fields only for the hackathon. KYB columns exist with defaults so
-- Phase 1 can fill them in without altering the table.

CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  name text NOT NULL,
  trading_name text,
  country text NOT NULL,
  registration_number text,
  tax_number text,
  address text,
  website text,
  contact_email text,
  contact_phone text,
  tier smallint NOT NULL DEFAULT 0 CHECK (tier BETWEEN 0 AND 3),
  kyb_status text NOT NULL DEFAULT 'draft'
    CHECK (kyb_status IN ('draft', 'submitted', 'auto_passed', 'auto_failed', 'verified', 'rejected', 'frozen')),
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  tier3_per_tx_limit_usd numeric(18, 2),
  tier3_monthly_limit_usd numeric(18, 2),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One business per owner in the MVP.
CREATE UNIQUE INDEX IF NOT EXISTS businesses_owner_user_id_key ON public.businesses (owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS businesses_country_registration_number_key
  ON public.businesses (country, registration_number) WHERE registration_number IS NOT NULL;
CREATE TRIGGER businesses_set_updated_at BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The signed-in user's business ids. Used by every owner policy below.
CREATE OR REPLACE FUNCTION public.my_business_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT id FROM public.businesses WHERE owner_user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.my_business_ids() TO authenticated, service_role;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.businesses TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.businesses TO authenticated;
CREATE POLICY "Owners read their business" ON public.businesses
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "Owners create their business" ON public.businesses
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "Owners update their business" ON public.businesses
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid() OR public.is_admin());

/* ------------------------------ payout_accounts ---------------------------- */
-- Where a business gets paid. One account per currency in the hackathon build.

CREATE TABLE IF NOT EXISTS public.payout_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  currency text NOT NULL,
  country text NOT NULL,
  method text NOT NULL CHECK (method IN ('bank', 'momo')),
  -- {bank_code, bank_name, account_number, account_name} for both methods.
  -- Mobile money uses the phone number as account_number and the network as bank_code.
  details jsonb NOT NULL,
  partner text NOT NULL DEFAULT 'payaza' CHECK (partner IN ('payaza', 'kotani', 'klasha')),
  partner_customer_key text,
  validated boolean NOT NULL DEFAULT false,
  -- The name the partner returned for the account, as evidence.
  validated_name text,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payout_accounts_business_currency_key
  ON public.payout_accounts (business_id, currency);
CREATE TRIGGER payout_accounts_set_updated_at BEFORE UPDATE ON public.payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payout_accounts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.payout_accounts TO service_role;
GRANT SELECT ON public.payout_accounts TO authenticated;
CREATE POLICY "Owners read their payout accounts" ON public.payout_accounts
  FOR SELECT TO authenticated USING (business_id IN (SELECT public.my_business_ids()) OR public.is_admin());

/* ------------------------------ payment_requests --------------------------- */
-- The old demo payment_requests table is replaced. Demos use demo_transactions.

DROP TABLE IF EXISTS public.payment_requests;

CREATE TABLE public.payment_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE,
  -- The business's own invoice number, as typed. Not unique: an invoice can be paid in parts.
  invoice_number text,
  idempotency_key text,
  -- Null means the payer enters the amount. This is the exact amount the business receives.
  amount numeric(18, 2) CHECK (amount IS NULL OR amount > 0),
  min_amount numeric(18, 2),
  max_amount numeric(18, 2),
  currency text NOT NULL,
  memo text,
  payer_email text,
  usage text NOT NULL DEFAULT 'single' CHECK (usage IN ('single', 'multi')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid', 'expired', 'disabled')),
  expires_at timestamptz,
  paid_count int NOT NULL DEFAULT 0,
  -- Numbers each payment attempt. Bumped inside start_collection_attempt.
  attempt_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_requests_business_idempotency_key
  ON public.payment_requests (business_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX payment_requests_business_created_at_idx
  ON public.payment_requests (business_id, created_at DESC);
CREATE INDEX payment_requests_business_invoice_number_idx
  ON public.payment_requests (business_id, invoice_number);
CREATE TRIGGER payment_requests_set_updated_at BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.payment_requests TO service_role;
GRANT SELECT ON public.payment_requests TO authenticated;
-- Payers read one row by reference through a server function, never a policy.
CREATE POLICY "Owners read their payment requests" ON public.payment_requests
  FOR SELECT TO authenticated USING (business_id IN (SELECT public.my_business_ids()) OR public.is_admin());

/* -------------------------------- transactions ----------------------------- */

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  kind text NOT NULL DEFAULT 'collection' CHECK (kind IN ('collection', 'transfer')),
  status text NOT NULL
    CHECK (status IN ('quoted', 'awaiting_payin', 'blocked', 'collected', 'held', 'paying_out', 'settled', 'failed', 'refunded')),
  -- Our reference, sent to the partner. Collections: one per attempt, MRD-XXXXXXXX-N.
  reference text NOT NULL UNIQUE,
  payment_request_id uuid REFERENCES public.payment_requests (id) ON DELETE RESTRICT,
  attempt_no int,
  idempotency_key text,
  recipient_id uuid,
  payout_account_id uuid REFERENCES public.payout_accounts (id) ON DELETE RESTRICT,
  send_currency text NOT NULL,
  -- The amount before fees. For a collection, the request amount.
  send_amount numeric(18, 2) NOT NULL,
  receive_currency text NOT NULL,
  -- What the business gets. Equals send_amount converted, because the payer covers fees.
  receive_amount numeric(18, 2) NOT NULL,
  partner_fee_in numeric(18, 2) NOT NULL DEFAULT 0,
  partner_fee_out numeric(18, 2) NOT NULL DEFAULT 0,
  meridian_fee numeric(18, 2) NOT NULL DEFAULT 0,
  -- What the payer is charged. Grossed up so total_charged - all fees = send_amount.
  total_charged numeric(18, 2) NOT NULL,
  usd_equivalent numeric(18, 2) NOT NULL DEFAULT 0,
  partner_in text CHECK (partner_in IS NULL OR partner_in IN ('payaza', 'kotani', 'klasha')),
  partner_in_ref text,
  -- The fee the partner reported on the collection, from its webhook or status query.
  partner_fee_reported numeric(18, 2),
  partner_out text CHECK (partner_out IS NULL OR partner_out IN ('payaza', 'kotani', 'klasha')),
  -- Our payout reference, set once before the payout call. Unique = one payout per collection.
  payout_reference text UNIQUE,
  partner_out_ref text,
  quote jsonb NOT NULL DEFAULT '{}'::jsonb,
  quote_expires_at timestamptz,
  -- What the payer needs to finish paying: virtual account details, momo instructions, checkout config.
  payin_details jsonb,
  payer_name text,
  payer_email text,
  payer_phone text,
  payer_country text,
  pay_method text NOT NULL CHECK (pay_method IN ('momo', 'bank', 'card')),
  collected_at timestamptz,
  settled_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_request_attempt_key
  ON public.transactions (payment_request_id, attempt_no) WHERE payment_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_business_idempotency_key
  ON public.transactions (business_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_business_created_at_idx
  ON public.transactions (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_status_idx ON public.transactions (status);
CREATE TRIGGER transactions_set_updated_at BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.transactions TO service_role;
GRANT SELECT ON public.transactions TO authenticated;
CREATE POLICY "Owners read their transactions" ON public.transactions
  FOR SELECT TO authenticated USING (business_id IN (SELECT public.my_business_ids()) OR public.is_admin());

/* ----------------------------- transaction_events -------------------------- */
-- Audit trail. Every webhook lands here first; a repeat hits the unique key and stops.

CREATE TABLE IF NOT EXISTS public.transaction_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES public.transactions (id) ON DELETE RESTRICT,
  source text NOT NULL
    CHECK (source IN ('system', 'payaza_webhook', 'kotani_webhook', 'klasha_webhook', 'admin', 'job')),
  from_status text,
  to_status text,
  payload jsonb,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transaction_events_transaction_created_at_idx
  ON public.transaction_events (transaction_id, created_at);

ALTER TABLE public.transaction_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.transaction_events TO service_role;
GRANT SELECT ON public.transaction_events TO authenticated;
CREATE POLICY "Owners read their transaction events" ON public.transaction_events
  FOR SELECT TO authenticated USING (
    transaction_id IN (SELECT id FROM public.transactions WHERE business_id IN (SELECT public.my_business_ids()))
    OR public.is_admin()
  );

/* --------------------------------- aml_flags ------------------------------- */

CREATE TABLE IF NOT EXISTS public.aml_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  transaction_id uuid REFERENCES public.transactions (id) ON DELETE RESTRICT,
  -- R1..R10 in the full MVP; hackathon checks use H_ names.
  rule text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  action_taken text NOT NULL CHECK (action_taken IN ('none', 'hold', 'block', 'freeze')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cleared', 'escalated')),
  resolved_by uuid,
  resolved_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aml_flags_status_created_at_idx ON public.aml_flags (status, created_at DESC);
CREATE INDEX IF NOT EXISTS aml_flags_transaction_idx ON public.aml_flags (transaction_id);

ALTER TABLE public.aml_flags ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.aml_flags TO service_role;
GRANT SELECT ON public.aml_flags TO authenticated;
CREATE POLICY "Owners read their flags" ON public.aml_flags
  FOR SELECT TO authenticated USING (business_id IN (SELECT public.my_business_ids()) OR public.is_admin());

/* ------------------------------- partner_calls ----------------------------- */

CREATE INDEX IF NOT EXISTS partner_calls_transaction_idx ON public.partner_calls (transaction_id);

/* ------------------------- start_collection_attempt ------------------------ */
-- Called by the pay page's server function. In one database transaction:
--   1. lock the payment request row,
--   2. refuse if it is not active, or single use and already paid, or expired,
--   3. bump attempt_count and insert the transaction in awaiting_payin,
--   4. return the new transaction.
-- Only after this returns does the server call Payaza. Two clicks cannot both
-- start a charge under the same attempt number, and a paid single-use request
-- cannot be charged again.

CREATE OR REPLACE FUNCTION public.to_base36(n int)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  digits constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v int := n;
  out text := '';
BEGIN
  IF v < 0 THEN RAISE EXCEPTION 'to_base36 needs a non-negative number'; END IF;
  IF v = 0 THEN RETURN '0'; END IF;
  WHILE v > 0 LOOP
    out := substr(digits, (v % 36) + 1, 1) || out;
    v := v / 36;
  END LOOP;
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_collection_attempt(
  p_reference text,
  p_amount numeric,
  p_total_charged numeric,
  p_partner_fee numeric,
  p_meridian_fee numeric,
  p_usd_equivalent numeric,
  p_pay_method text,
  p_payout_account_id uuid,
  p_payer jsonb,
  p_quote jsonb
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pr public.payment_requests%ROWTYPE;
  tx public.transactions%ROWTYPE;
  attempt int;
BEGIN
  SELECT * INTO pr FROM public.payment_requests WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF pr.status <> 'active' THEN
    RAISE EXCEPTION 'request_not_active' USING ERRCODE = 'P0003';
  END IF;
  IF pr.expires_at IS NOT NULL AND pr.expires_at < now() THEN
    UPDATE public.payment_requests SET status = 'expired' WHERE id = pr.id;
    RAISE EXCEPTION 'request_expired' USING ERRCODE = 'P0003';
  END IF;
  IF pr.usage = 'single' AND pr.paid_count > 0 THEN
    RAISE EXCEPTION 'request_already_paid' USING ERRCODE = 'P0003';
  END IF;
  IF pr.amount IS NOT NULL AND pr.amount <> p_amount THEN
    RAISE EXCEPTION 'amount_mismatch' USING ERRCODE = 'P0004';
  END IF;
  IF pr.amount IS NULL AND (
       (pr.min_amount IS NOT NULL AND p_amount < pr.min_amount) OR
       (pr.max_amount IS NOT NULL AND p_amount > pr.max_amount)) THEN
    RAISE EXCEPTION 'amount_out_of_range' USING ERRCODE = 'P0004';
  END IF;

  attempt := pr.attempt_count + 1;
  -- Two base-36 characters keep the attempt reference inside Payaza's 15-character card limit.
  IF attempt > 1295 THEN
    RAISE EXCEPTION 'too_many_attempts' USING ERRCODE = 'P0005';
  END IF;
  UPDATE public.payment_requests SET attempt_count = attempt WHERE id = pr.id;

  INSERT INTO public.transactions (
    business_id, kind, status, reference, payment_request_id, attempt_no, payout_account_id,
    send_currency, send_amount, receive_currency, receive_amount,
    partner_fee_in, meridian_fee, total_charged, usd_equivalent,
    partner_in, quote, pay_method,
    payer_name, payer_email, payer_phone, payer_country
  ) VALUES (
    pr.business_id, 'collection', 'awaiting_payin',
    p_reference || '-' || public.to_base36(attempt), pr.id, attempt, p_payout_account_id,
    pr.currency, p_amount, pr.currency, p_amount,
    p_partner_fee, p_meridian_fee, p_total_charged, p_usd_equivalent,
    'payaza', coalesce(p_quote, '{}'::jsonb), p_pay_method,
    p_payer ->> 'name', p_payer ->> 'email', p_payer ->> 'phone', p_payer ->> 'country'
  ) RETURNING * INTO tx;

  RETURN tx;
END;
$$;
REVOKE ALL ON FUNCTION public.start_collection_attempt(text, numeric, numeric, numeric, numeric, numeric, text, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_collection_attempt(text, numeric, numeric, numeric, numeric, numeric, text, uuid, jsonb, jsonb) TO service_role;

/* ------------------------------ record_payment ----------------------------- */
-- Runs when a collection settles. Bumps paid_count and closes a single-use
-- request, in the same statement, so two settlements cannot both see paid_count = 0.

CREATE OR REPLACE FUNCTION public.mark_request_paid(p_request_id uuid)
RETURNS public.payment_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pr public.payment_requests%ROWTYPE;
BEGIN
  UPDATE public.payment_requests
  SET paid_count = paid_count + 1,
      status = CASE WHEN usage = 'single' THEN 'paid' ELSE status END
  WHERE id = p_request_id
  RETURNING * INTO pr;
  RETURN pr;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_request_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_request_paid(uuid) TO service_role;
