-- Решение является зафиксированным результатом, а не исполняемой работой.
UPDATE records
SET status = 'completed',
    progress = 100,
    estimate_minutes = 0,
    actual_minutes = 0,
    due_at = NULL,
    completed_at = COALESCE(completed_at, updated_at)
WHERE type = 'decision'
  AND status NOT IN ('archived', 'cancelled');
