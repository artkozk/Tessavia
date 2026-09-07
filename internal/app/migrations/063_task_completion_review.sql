ALTER TABLE records ADD COLUMN review_pending INTEGER NOT NULL DEFAULT 0 CHECK(review_pending IN (0,1));

UPDATE records SET status='completed', review_pending=1,
    completed_at=COALESCE(completed_at,(SELECT created_at FROM task_review_events WHERE record_id=records.id ORDER BY created_at DESC,rowid DESC LIMIT 1)),
    stage_id=CASE WHEN EXISTS(SELECT 1 FROM collection_stages WHERE id=records.stage_id AND category='done' AND archived_at IS NULL) THEN stage_id
        ELSE COALESCE((SELECT id FROM collection_stages WHERE collection_id=records.collection_id AND category='done' AND archived_at IS NULL ORDER BY sort_order,id LIMIT 1),stage_id) END,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE type='task' AND status='review' AND progress=100
AND (SELECT action FROM task_review_events WHERE record_id=records.id ORDER BY created_at DESC,rowid DESC LIMIT 1)='submitted';
