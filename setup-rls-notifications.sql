-- ============================================
-- 🔐 Row Level Security (RLS) pour notifications
-- ============================================

-- Enable RLS on the notifications table
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 1. Policy: Users can SELECT their own notifications
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- 2. Policy: Users can UPDATE their own notifications (mark as read, etc)
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Policy: Service role can INSERT notifications (for API routes)
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (true);

-- 4. Policy: Service role can SELECT all notifications (for API routes)
DROP POLICY IF EXISTS "Service role can select all notifications" ON public.notifications;
CREATE POLICY "Service role can select all notifications"
  ON public.notifications
  FOR SELECT
  USING (true);

-- Verify policies are active
SELECT * FROM pg_policies WHERE tablename = 'notifications';
