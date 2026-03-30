-- Add admin by email (works even if user already exists)
INSERT INTO public.admin_users (user_id)
SELECT id FROM auth.users WHERE email = 'talesotto@gmail.com'
ON CONFLICT DO NOTHING;
