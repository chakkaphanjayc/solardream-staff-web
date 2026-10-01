ALTER TABLE public.rich_menu_schedules
  ADD COLUMN IF NOT EXISTS last_applied_window_key text,
  ADD COLUMN IF NOT EXISTS last_applied_at timestamptz;
