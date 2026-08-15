ALTER TABLE chat_messages ADD COLUMN client_nonce TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX chat_messages_client_nonce_unique
ON chat_messages(thread_id, author_id, client_nonce)
WHERE client_nonce <> '';
