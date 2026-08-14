package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

type Store struct {
	db *sql.DB
}

type User struct {
	ID        int64  `json:"id"`
	Email     string `json:"email"`
	Username  string `json:"username"`
	CreatedAt string `json:"createdAt"`
}

type Record struct {
	ID                string  `json:"id"`
	Type              string  `json:"type"`
	Kind              string  `json:"kind"`
	Title             string  `json:"title"`
	Description       string  `json:"description"`
	Status            string  `json:"status"`
	AuthorID          int64   `json:"authorId"`
	AuthorUsername    string  `json:"authorUsername"`
	OwnerID           int64   `json:"ownerId"`
	OwnerUsername     string  `json:"ownerUsername"`
	DecisionMakerID   *int64  `json:"decisionMakerId"`
	DecisionMakerName *string `json:"decisionMakerUsername"`
	DueAt             *string `json:"dueAt"`
	Priority          string  `json:"priority"`
	Workstream        string  `json:"workstream"`
	EditPolicy        string  `json:"editPolicy"`
	ParentID          *string `json:"parentId"`
	IsRoot            bool    `json:"isRoot"`
	EstimateMinutes   int     `json:"estimateMinutes"`
	ActualMinutes     int     `json:"actualMinutes"`
	Progress          int     `json:"progress"`
	ProgressNote      string  `json:"progressNote"`
	Result            string  `json:"result"`
	CompletedAt       *string `json:"completedAt"`
	CreatedAt         string  `json:"createdAt"`
	UpdatedAt         string  `json:"updatedAt"`
	ProofCount        int     `json:"proofCount"`
}

type SectionDefinition struct {
	ID        string  `json:"id"`
	Key       string  `json:"key"`
	Name      string  `json:"name"`
	ScopeType *string `json:"scopeType"`
	Kind      string  `json:"kind"`
	Active    bool    `json:"active"`
	SortOrder int     `json:"sortOrder"`
}

type RecordSection struct {
	ID            string  `json:"id"`
	RecordID      string  `json:"recordId"`
	DefinitionID  *string `json:"definitionId"`
	Title         string  `json:"title"`
	Content       string  `json:"content"`
	SortOrder     int     `json:"sortOrder"`
	UpdatedBy     int64   `json:"updatedBy"`
	UpdatedByName string  `json:"updatedByUsername"`
	UpdatedAt     string  `json:"updatedAt"`
}

type RecordLink struct {
	ID           string `json:"id"`
	SourceID     string `json:"sourceId"`
	TargetID     string `json:"targetId"`
	RelationType string `json:"relationType"`
	Record       Record `json:"record"`
	CreatedAt    string `json:"createdAt"`
}

type RecordDerivation struct {
	SourceRecordID    string `json:"sourceRecordId"`
	SourceRecordTitle string `json:"sourceRecordTitle"`
	SourceQuestionID  string `json:"sourceQuestionId"`
	QuestionBody      string `json:"questionBody"`
	SourceDecisionID  string `json:"sourceDecisionId"`
	DecisionContent   string `json:"decisionContent"`
	CreatedAt         string `json:"createdAt"`
}

type CriterionScore struct {
	ID                string `json:"id"`
	RecordID          string `json:"recordId"`
	CriterionID       string `json:"criterionId"`
	CriterionTitle    string `json:"criterionTitle"`
	Score             int    `json:"score"`
	Note              string `json:"note"`
	EvaluatedBy       int64  `json:"evaluatedBy"`
	EvaluatorUsername string `json:"evaluatorUsername"`
	UpdatedAt         string `json:"updatedAt"`
}

type Proof struct {
	ID             string `json:"id"`
	RecordID       string `json:"recordId"`
	AuthorID       int64  `json:"authorId"`
	AuthorUsername string `json:"authorUsername"`
	Kind           string `json:"kind"`
	Content        string `json:"content"`
	CreatedAt      string `json:"createdAt"`
}

type Notification struct {
	ID         string  `json:"id"`
	Type       string  `json:"type"`
	Title      string  `json:"title"`
	Body       string  `json:"body"`
	EntityType *string `json:"entityType"`
	EntityID   *string `json:"entityId"`
	ReadAt     *string `json:"readAt"`
	CreatedAt  string  `json:"createdAt"`
}

type Activity struct {
	ID            string         `json:"id"`
	ActorID       int64          `json:"actorId"`
	ActorUsername string         `json:"actorUsername"`
	EntityType    string         `json:"entityType"`
	EntityID      string         `json:"entityId"`
	Action        string         `json:"action"`
	Details       map[string]any `json:"details"`
	Reason        string         `json:"reason"`
	CreatedAt     string         `json:"createdAt"`
}

type QuestionAnswer struct {
	ID             string `json:"id"`
	QuestionID     string `json:"questionId"`
	AuthorID       int64  `json:"authorId"`
	AuthorUsername string `json:"authorUsername"`
	Content        string `json:"content"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type QuestionDecision struct {
	ID                   string  `json:"id"`
	QuestionID           string  `json:"questionId"`
	Content              string  `json:"content"`
	SourceAnswerID       *string `json:"sourceAnswerId"`
	SourceAuthorUsername *string `json:"sourceAuthorUsername"`
	DecidedBy            int64   `json:"decidedBy"`
	DecidedByUsername    string  `json:"decidedByUsername"`
	CreatedAt            string  `json:"createdAt"`
	UpdatedAt            string  `json:"updatedAt"`
}

type QuestionOutput struct {
	ID        string `json:"id"`
	RecordID  string `json:"recordId"`
	Type      string `json:"type"`
	Kind      string `json:"kind"`
	Title     string `json:"title"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`
}

type QuestionItem struct {
	ID        string            `json:"id"`
	RecordID  string            `json:"recordId"`
	Body      string            `json:"body"`
	Status    string            `json:"status"`
	SortOrder int               `json:"sortOrder"`
	CreatedBy int64             `json:"createdBy"`
	CreatedAt string            `json:"createdAt"`
	UpdatedAt string            `json:"updatedAt"`
	Answers   []QuestionAnswer  `json:"answers"`
	Decision  *QuestionDecision `json:"decision"`
	Outputs   []QuestionOutput  `json:"outputs"`
}

type QuestionWorkflow struct {
	Questions []QuestionItem `json:"questions"`
	UserCount int            `json:"userCount"`
	Answered  int            `json:"answered"`
	Expected  int            `json:"expected"`
	Resolved  int            `json:"resolved"`
}

type PendingQuestion struct {
	QuestionID  string  `json:"questionId"`
	Body        string  `json:"body"`
	RecordID    string  `json:"recordId"`
	RecordTitle string  `json:"recordTitle"`
	DueAt       *string `json:"dueAt"`
	CreatedAt   string  `json:"createdAt"`
}

func OpenStore(path string) (*Store, error) {
	if path != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			return nil, fmt.Errorf("create database directory: %w", err)
		}
	}
	dsn := path
	if path != ":memory:" {
		dsn = "file:" + filepath.ToSlash(path) + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)"
	}
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	store := &Store{db: db}
	if err := store.migrate(context.Background()); err != nil {
		db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		return fmt.Errorf("create schema migrations: %w", err)
	}
	entries, err := fs.ReadDir(migrationFiles, "migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		var applied int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, entry.Name()).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", entry.Name(), err)
		}
		if applied > 0 {
			continue
		}
		body, err := migrationFiles.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}
		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", entry.Name(), err)
		}
		if _, err = tx.ExecContext(ctx, string(body)); err != nil {
			tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", entry.Name(), err)
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)`, entry.Name(), nowText()); err != nil {
			tx.Rollback()
			return fmt.Errorf("record migration %s: %w", entry.Name(), err)
		}
		if err = tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", entry.Name(), err)
		}
	}
	return nil
}

func newID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func newSessionToken() (string, string, error) {
	buffer := make([]byte, 32)
	if _, err := rand.Read(buffer); err != nil {
		return "", "", err
	}
	token := hex.EncodeToString(buffer)
	return token, hashToken(token), nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func nowText() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func normalizeDueAt(value string) (*string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return nil, errors.New("dueAt must be RFC3339")
	}
	normalized := parsed.UTC().Format(time.RFC3339)
	return &normalized, nil
}

func writeActivity(ctx context.Context, tx *sql.Tx, actorID int64, entityType, entityID, action, reason string, details map[string]any) error {
	id, err := newID()
	if err != nil {
		return err
	}
	body, err := json.Marshal(details)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, id, actorID, entityType, entityID, action, string(body), reason, nowText())
	return err
}
