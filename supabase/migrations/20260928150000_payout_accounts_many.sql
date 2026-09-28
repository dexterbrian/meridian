-- A business can hold several payout accounts in the same currency, for example
-- an M-Pesa number and a bank account, both in KES. Exactly one per currency is
-- the default, and that is where payouts in that currency go.

DROP INDEX IF EXISTS public.payout_accounts_business_currency_key;

-- At most one default per business and currency.
CREATE UNIQUE INDEX IF NOT EXISTS payout_accounts_one_default_per_currency_key
  ON public.payout_accounts (business_id, currency) WHERE is_default;

CREATE INDEX IF NOT EXISTS payout_accounts_business_currency_idx
  ON public.payout_accounts (business_id, currency);

-- New accounts are not the default unless the server says so.
ALTER TABLE public.payout_accounts ALTER COLUMN is_default SET DEFAULT false;

-- Makes one account the default for its currency, in one statement, so the
-- one-default index never sees two defaults or none.
CREATE OR REPLACE FUNCTION public.set_default_payout_account(p_business_id uuid, p_account_id uuid)
RETURNS public.payout_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  acc public.payout_accounts%ROWTYPE;
BEGIN
  SELECT * INTO acc FROM public.payout_accounts
  WHERE id = p_account_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account_not_found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.payout_accounts SET is_default = false
  WHERE business_id = p_business_id AND currency = acc.currency AND is_default AND id <> acc.id;
  UPDATE public.payout_accounts SET is_default = true WHERE id = acc.id RETURNING * INTO acc;
  RETURN acc;
END;
$$;
REVOKE ALL ON FUNCTION public.set_default_payout_account(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_default_payout_account(uuid, uuid) TO service_role;
