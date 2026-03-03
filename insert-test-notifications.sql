-- ============================================
-- 📝 INSERT Manual Test Notifications
-- ============================================

-- Your UID: 63efeb2d-6b5f-486d-8163-7485b26b9329

-- 1. Summary notification
INSERT INTO public.notifications (
  user_id,
  type,
  title,
  message,
  ref_key,
  read,
  created_at
) VALUES (
  '63efeb2d-6b5f-486d-8163-7485b26b9329',
  'summary',
  '📊 Résumé quotidien',
  '5 PRO • 3 PERSO • 2 en retard',
  'summary-2026-03-03',
  false,
  NOW()
);

-- 2. Deadline notification 1
INSERT INTO public.notifications (
  user_id,
  type,
  title,
  message,
  ref_key,
  read,
  created_at
) VALUES (
  '63efeb2d-6b5f-486d-8163-7485b26b9329',
  'deadline',
  '⏰ Tâche en retard',
  'La tâche "Finir rapport Q1" est en retard.',
  'deadline-task-001',
  false,
  NOW() - INTERVAL '2 hours'
);

-- 3. Deadline notification 2
INSERT INTO public.notifications (
  user_id,
  type,
  title,
  message,
  ref_key,
  read,
  created_at
) VALUES (
  '63efeb2d-6b5f-486d-8163-7485b26b9329',
  'deadline',
  '⏰ Tâche en retard',
  'La tâche "Appel client important" est en retard.',
  'deadline-task-002',
  true,
  NOW() - INTERVAL '1 day'
);

-- 4. General notification (already read)
INSERT INTO public.notifications (
  user_id,
  type,
  title,
  message,
  ref_key,
  read,
  created_at
) VALUES (
  '63efeb2d-6b5f-486d-8163-7485b26b9329',
  'info',
  '✅ Tâche complétée',
  'Vous avez marqué "Préparation réunion" comme terminée',
  'completion-task-003',
  true,
  NOW() - INTERVAL '3 days'
);

-- 5. Another summary (read)
INSERT INTO public.notifications (
  user_id,
  type,
  title,
  message,
  ref_key,
  read,
  created_at
) VALUES (
  '63efeb2d-6b5f-486d-8163-7485b26b9329',
  'summary',
  '📊 Résumé quotidien',
  '4 PRO • 2 PERSO • 1 en retard',
  'summary-2026-03-02',
  true,
  NOW() - INTERVAL '1 day'
);

-- Verify: Show all notifications for this user
SELECT id, type, title, message, read, created_at 
FROM public.notifications 
WHERE user_id = '63efeb2d-6b5f-486d-8163-7485b26b9329'
ORDER BY created_at DESC;
