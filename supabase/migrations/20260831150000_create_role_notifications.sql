-- Create role_notifications table with RLS and Realtime
CREATE TABLE IF NOT EXISTS public.role_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    target_role TEXT NOT NULL DEFAULT 'all',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.role_notifications ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.role_notifications TO anon, authenticated;

DROP POLICY IF EXISTS "Allow public all access on role_notifications" ON public.role_notifications;
CREATE POLICY "Allow public all access on role_notifications" 
  ON public.role_notifications 
  FOR ALL 
  TO public, anon, authenticated
  USING (true) 
  WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'role_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.role_notifications;
  END IF;
END $$;
