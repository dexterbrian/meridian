-- Local seed data. Runs on `npx supabase db reset`, never on the hosted project.
--
-- Payaza's sandbox answers every account name enquiry with the same account,
-- whatever currency, bank code or number is sent. Checked with curl on
-- 29 September 2026 across NGN, KES, UGX, GHS and TZS, real and made-up codes:
--
--   account_number 0239573384, bank_code 000014, account_name "Chibunkem Ojiaku"
--
-- So any test business fails the payout name check in sandbox. This seed adds a
-- business named after that account, which passes it for real. Sign in as
-- chibunkem.ojiaku@example.test; the code arrives in Mailpit (http://127.0.0.1:54324).
--
-- Fixed ids and ON CONFLICT DO NOTHING make it safe to run more than once.

-- The user. Token columns must be '' rather than NULL, or Supabase Auth fails
-- to load the user at sign-in.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c0a1b2c3-0000-4000-8000-00000000c0de',
  'authenticated', 'authenticated',
  'chibunkem.ojiaku@example.test', '', now(),
  '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c0a1b2c3-0000-4000-8000-00000000c0de',
  'c0a1b2c3-0000-4000-8000-00000000c0de',
  'c0a1b2c3-0000-4000-8000-00000000c0de',
  'email',
  '{"sub": "c0a1b2c3-0000-4000-8000-00000000c0de", "email": "chibunkem.ojiaku@example.test", "email_verified": true}',
  now(), now(), now()
) ON CONFLICT DO NOTHING;

-- The business, named exactly as Payaza's sandbox names the account.
INSERT INTO public.businesses (id, owner_user_id, name, country, contact_email)
VALUES (
  'c0a1b2c3-0000-4000-8000-0000000b0015',
  'c0a1b2c3-0000-4000-8000-00000000c0de',
  'Chibunkem Ojiaku', 'NG', 'chibunkem.ojiaku@example.test'
) ON CONFLICT DO NOTHING;

-- Its payout account: the one Payaza's sandbox always returns (Nigerian bank,
-- NIP code 000014). Marked verified with the name Payaza gave, as the app would.
INSERT INTO public.payout_accounts (
  id, business_id, currency, country, method, details, partner, validated, validated_name, is_default
) VALUES (
  'c0a1b2c3-0000-4000-8000-0000000a0014',
  'c0a1b2c3-0000-4000-8000-0000000b0015',
  'NGN', 'NG', 'bank',
  '{"bank_code": "000014", "bank_name": "Payaza sandbox bank (000014)", "account_number": "0239573384", "account_name": "Chibunkem Ojiaku"}',
  'payaza', true, 'Chibunkem Ojiaku', true
) ON CONFLICT DO NOTHING;
