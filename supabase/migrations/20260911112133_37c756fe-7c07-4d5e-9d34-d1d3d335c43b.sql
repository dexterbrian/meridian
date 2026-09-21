CREATE TABLE public.waitlist_signups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  country text,
  monthly_volume text,
  pain_point text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.waitlist_signups TO anon, authenticated;
GRANT ALL ON public.waitlist_signups TO service_role;
ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can join the waitlist" ON public.waitlist_signups FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TABLE public.contact_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  company text,
  subject text,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT ALL ON public.contact_messages TO service_role;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can send a message" ON public.contact_messages FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TABLE public.payment_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reference text NOT NULL UNIQUE,
  from_business text NOT NULL,
  to_business text NOT NULL,
  to_email text,
  amount numeric NOT NULL,
  currency text NOT NULL,
  memo text,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payment_requests TO anon, authenticated;
GRANT ALL ON public.payment_requests TO service_role;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Demo payment requests are viewable by link" ON public.payment_requests FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can create a demo payment request" ON public.payment_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can settle a demo payment request" ON public.payment_requests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.demo_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL,
  reference text,
  payer_name text,
  payer_email text,
  merchant text,
  send_currency text NOT NULL,
  receive_currency text NOT NULL,
  amount numeric NOT NULL,
  partner_fee numeric NOT NULL DEFAULT 0,
  meridian_fee numeric NOT NULL DEFAULT 0,
  total_fee numeric NOT NULL DEFAULT 0,
  recipient_gets numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.demo_transactions TO anon, authenticated;
GRANT ALL ON public.demo_transactions TO service_role;
ALTER TABLE public.demo_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can log a demo transaction" ON public.demo_transactions FOR INSERT TO anon, authenticated WITH CHECK (true);