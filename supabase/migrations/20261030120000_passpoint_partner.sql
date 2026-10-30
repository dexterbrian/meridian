-- Passpoint joins the providers a payment can go through. The old names stay
-- allowed, because rows from the retired Payaza and Minisend flows still carry
-- them. Payout accounts are now checked through Kotani, so new ones default to it.

ALTER TABLE public.payout_accounts DROP CONSTRAINT IF EXISTS payout_accounts_partner_check;
ALTER TABLE public.payout_accounts ADD CONSTRAINT payout_accounts_partner_check
  CHECK (partner IN ('payaza', 'kotani', 'yellowcard', 'klasha', 'minisend', 'passpoint'));
ALTER TABLE public.payout_accounts ALTER COLUMN partner SET DEFAULT 'kotani';

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_partner_in_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_partner_in_check
  CHECK (partner_in IS NULL OR partner_in IN ('payaza', 'kotani', 'yellowcard', 'klasha', 'minisend', 'passpoint'));

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_partner_out_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_partner_out_check
  CHECK (partner_out IS NULL OR partner_out IN ('payaza', 'kotani', 'yellowcard', 'klasha', 'minisend', 'passpoint'));
