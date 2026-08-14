PRAGMA foreign_keys = ON;
SELECT 'users=' || COUNT(*) FROM users;
SELECT 'records=' || COUNT(*) FROM records;
SELECT 'migrations=' || group_concat(version, ',') FROM schema_migrations;
SELECT 'audit_tasks=' || COUNT(*) FROM records WHERE id LIKE 'c425d66%' AND status='completed';
SELECT 'audit_proofs=' || COUNT(*) FROM task_proofs WHERE record_id LIKE 'c425d66%';
SELECT 'platform_goal_progress=' || progress FROM records WHERE id='d004d7e0000000000000000000000001';
SELECT 'original_record=' || id || '|' || title || '|' || status || '|' || COALESCE(due_at, '') || '|' || priority || '|' || estimate_minutes
FROM records WHERE id='ec48bd57e6e0e7997f424529a4f42bc0';
SELECT 'pending_groq_task=' || id || '|' || title || '|' || status || '|' || edit_policy
FROM records WHERE id='d004d7e0000000000000000000000008';
PRAGMA integrity_check;
SELECT 'foreign_key_violations=' || COUNT(*) FROM pragma_foreign_key_check;
