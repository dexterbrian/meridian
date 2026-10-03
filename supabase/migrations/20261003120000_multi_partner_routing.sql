-- Multi-provider routing: Kotani Pay, Yellow Card, Klasha and Minisend join Payaza.
-- 1. The partner columns accept the new providers.
-- 2. Transactions accept the new payer rails (international bank transfer into a
--    virtual account, stablecoin, Chinese wallets).
-- 3. recipients: suppliers a business pays (TRD 2.2), for outbound transfers.
-- 4. start_routed_attempt: like start_collection_attempt, for a payer paying in a
--    different currency or through a routed provider. The business still receives
--    exactly the request amount in the request currency.

/* ------------------------------- partner lists ----------------------------- */

ALTER TABLE public.payout_accounts DROP CONSTRAINT IF EXISTS payout_accounts_partner_check;
ALTER TABLE public.payout_accounts ADD CONSTRAINT payout_accounts_partner_check
  CHECK (partner IN ('payaza', 'kotani', 'yellowcard', 'klasha', 'minisend'));

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_partner_in_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_partner_in_check
  CHECK (partner_in IS NULL OR partner_in IN ('payaza', 'kotani', 'yellowcard', 'klasha', 'minisend'));

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_partner_out_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_partner_out_check
  CHECK (partner_out IS NULL OR partner_out IN ('payaza', 'kotani', 'yellowcard', 'klasha', 'minisend'));

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_pay_method_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_pay_method_check
  CHECK (pay_method IN ('momo', 'bank', 'card', 'virtual_account', 'stablecoin', 'wallet'));

ALTER TABLE public.transaction_events DROP CONSTRAINT IF EXISTS transaction_events_source_check;
ALTER TABLE public.transaction_events ADD CONSTRAINT transaction_events_source_check
  CHECK (source IN ('system', 'payaza_webhook', 'kotani_webhook', 'klasha_webhook', 'yellowcard_webhook', 'minisend_webhook', 'admin', 'job'));

/* -------------------------------- recipients ------------------------------- */

CREATE TABLE IF NOT EXISTS public.recipients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  name text NOT NULL,
  country text NOT NULL,
  currency text NOT NULL,
  method text NOT NULL CHECK (method IN ('momo', 'bank', 'wallet')),
  -- {account_number, bank_name, bank_code, network, swift_code, iban, address, email}
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Per-provider ids created for this recipient, e.g. {"klasha": "beneficiary-token"}.
  partner_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  screened_at timestamptz,
  screening_result jsonb,
  first_paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recipients_business_idx ON public.recipients (business_id, created_at DESC);
CREATE TRIGGER recipients_set_updated_at BEFORE UPDATE ON public.recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.recipients ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.recipients TO service_role;
GRANT SELECT ON public.recipients TO authenticated;
CREATE POLICY "Owners read their recipients" ON public.recipients
  FOR SELECT TO authenticated USING (business_id IN (SELECT public.my_business_ids()) OR public.is_admin());

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.recipients (id) ON DELETE RESTRICT;

/* --------------------------- start_routed_attempt -------------------------- */
-- Same locking and checks as start_collection_attempt. The payer may pay in a
-- different currency (p_send_currency) through a routed provider; the business
-- still receives exactly the request amount in the request currency.

CREATE OR REPLACE FUNCTION public.start_routed_attempt(
  p_reference text,
  p_receive_amount numeric,
  p_send_currency text,
  p_send_amount numeric,
  p_total_charged numeric,
  p_partner_fee numeric,
  p_meridian_fee numeric,
  p_usd_equivalent numeric,
  p_pay_method text,
  p_partner text,
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
  IF pr.amount IS NULL OR pr.amount <> p_receive_amount THEN
    RAISE EXCEPTION 'amount_mismatch' USING ERRCODE = 'P0004';
  END IF;

  attempt := pr.attempt_count + 1;
  IF attempt > 1295 THEN
    RAISE EXCEPTION 'too_many_attempts' USING ERRCODE = 'P0005';
  END IF;
  UPDATE public.payment_requests SET attempt_count = attempt WHERE id = pr.id;

  INSERT INTO public.transactions (
    business_id, kind, status, reference, payment_request_id, attempt_no, payout_account_id,
    send_currency, send_amount, receive_currency, receive_amount,
    partner_fee_in, meridian_fee, total_charged, usd_equivalent,
    partner_in, partner_out, quote, pay_method,
    payer_name, payer_email, payer_phone, payer_country
  ) VALUES (
    pr.business_id, 'collection', 'awaiting_payin',
    p_reference || '-' || public.to_base36(attempt), pr.id, attempt, p_payout_account_id,
    p_send_currency, p_send_amount, pr.currency, pr.amount,
    p_partner_fee, p_meridian_fee, p_total_charged, p_usd_equivalent,
    p_partner, p_partner, coalesce(p_quote, '{}'::jsonb), p_pay_method,
    p_payer ->> 'name', p_payer ->> 'email', p_payer ->> 'phone', p_payer ->> 'country'
  ) RETURNING * INTO tx;

  RETURN tx;
END;
$$;
REVOKE ALL ON FUNCTION public.start_routed_attempt(text, numeric, text, numeric, numeric, numeric, numeric, numeric, text, text, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_routed_attempt(text, numeric, text, numeric, numeric, numeric, numeric, numeric, text, text, uuid, jsonb, jsonb) TO service_role;
