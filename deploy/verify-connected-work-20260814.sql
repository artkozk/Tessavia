PRAGMA integrity_check;
SELECT 'foreign_key_violations=' || COUNT(*) FROM pragma_foreign_key_check;
SELECT 'users=' || COUNT(*) FROM users;
SELECT 'records=' || COUNT(*) FROM records;
SELECT 'migrations=' || group_concat(version, ',') FROM schema_migrations;
SELECT 'platform_records=' || COUNT(*) FROM records WHERE workstream='platform';
SELECT 'platform_roots=' || COUNT(*) FROM records WHERE workstream='platform' AND is_root=1;
SELECT 'completed_platform_tasks=' || COUNT(*) FROM records WHERE type='task' AND workstream='platform' AND status='completed';
SELECT 'pending_platform_tasks=' || COUNT(*) FROM records WHERE type='task' AND workstream='platform' AND status='planned';
SELECT 'platform_proofs=' || COUNT(*) FROM task_proofs WHERE record_id LIKE 'd004d7e%';
SELECT 'original_record=' || id || '|' || title || '|' || status || '|' || COALESCE(due_at, '') || '|' || estimate_minutes
FROM records
WHERE id='ec48bd57e6e0e7997f424529a4f42bc0';
SELECT 'pending_task=' || id || '|' || title || '|' || owner_id || '|' || edit_policy
FROM records
WHERE id='d004d7e0000000000000000000000008';
