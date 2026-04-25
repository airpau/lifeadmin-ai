-- Update handle_new_user to provision a 14-day Pro trial automatically
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    email, 
    full_name, 
    subscription_tier, 
    subscription_status, 
    trial_ends_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    'pro',           -- Automatic Pro tier
    'trialing',      -- Trial status
    NOW() + INTERVAL '14 days' -- Trial expires in 14 days
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
