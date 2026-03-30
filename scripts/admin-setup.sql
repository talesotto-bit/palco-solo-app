-- Auto-add admin when user signs up with specific email
CREATE OR REPLACE FUNCTION public.auto_add_admin()
RETURNS trigger AS $$
BEGIN
  IF NEW.email IN ('talesotto@gmail.com') THEN
    INSERT INTO public.admin_users (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_admin();
