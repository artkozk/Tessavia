package main

import (
	"bytes"
	"crypto/rand"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

const contact = "https://control.e-rd.ru"

func prepared(t *testing.T, body string, enable bool) []byte {
	t.Helper()
	out, err := prepare([]byte(body), contact, enable, rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func keys(t *testing.T, body []byte) map[string]string {
	t.Helper()
	values, _, _, err := parseConfig(body)
	if err != nil {
		t.Fatal(err)
	}
	return values
}

func TestGeneratesValidPairPreservesSettingsAndDoesNotEnableImplicitly(t *testing.T) {
	original := "# existing configuration\r\nOTHER_SECRET='leave this alone'\r\nBUSINESS_PUSH_ENABLED=false\r\n"
	out := prepared(t, original, false)
	if !bytes.HasPrefix(out, []byte(original)) {
		t.Fatal("existing settings changed")
	}
	v := keys(t, out)
	if !validPair(v[publicName], v[privateName]) || v[subjectName] != contact || v[enabledName] != "false" {
		t.Fatal("generated configuration is invalid")
	}
	if bytes.Contains(bytes.ReplaceAll(out, []byte("\r\n"), nil), []byte("\n")) {
		t.Fatal("new assignments must preserve CRLF convention")
	}
}

func TestPreservesExistingPairAndSubjectAcrossExplicitEnable(t *testing.T) {
	first := prepared(t, "BUSINESS_PUSH_ENABLED=false\n", false)
	v := keys(t, first)
	repeated := prepared(t, string(first), false)
	if !bytes.Equal(first, repeated) {
		t.Fatal("idempotent preparation changed existing bytes")
	}
	enabled := prepared(t, string(first), true)
	got := keys(t, enabled)
	if got[publicName] != v[publicName] || got[privateName] != v[privateName] || got[subjectName] != v[subjectName] || got[enabledName] != "true" {
		t.Fatal("explicit enable rotated existing material")
	}
	if !bytes.Equal(enabled, prepared(t, string(enabled), false)) {
		t.Fatal("default invocation disabled a configured worker")
	}
}

func TestCanCompleteMissingSubjectWithoutRotatingKeys(t *testing.T) {
	v := keys(t, prepared(t, "", false))
	body := publicName + "='" + v[publicName] + "'\n" + privateName + "=\"" + v[privateName] + "\"\n"
	got := keys(t, prepared(t, body, false))
	if got[publicName] != v[publicName] || got[privateName] != v[privateName] || got[subjectName] != contact {
		t.Fatal("existing quoted pair changed")
	}
}

func TestRejectsIncompleteInvalidDuplicateAndContinuedAssignments(t *testing.T) {
	valid := keys(t, prepared(t, "", false))
	other := keys(t, prepared(t, "", false))
	for _, body := range []string{
		publicName + "=" + valid[publicName],
		privateName + "=" + valid[privateName],
		publicName + "=invalid\n" + privateName + "=invalid",
		publicName + "=" + valid[publicName] + "\n" + privateName + "=" + other[privateName],
		publicName + "=\n" + publicName + "=",
		enabledName + "=false\n" + enabledName + "=true",
		subjectName + "=http://insecure.example",
		subjectName + "=https://user:pass@example.test",
		subjectName + "=\"https://example.test\\nINJECT=true\"",
		"export " + privateName + "=private",
		privateName + "='unterminated",
		privateName + "=x # cannot reinterpret comments",
		enabledName + "=maybe",
		"OTHER=continued\\\n" + publicName + "=value",
		"OTHER=zero\x00byte",
	} {
		t.Run(strings.SplitN(body, "=", 2)[0], func(t *testing.T) {
			if _, err := prepare([]byte(body), contact, false, rand.Reader); err == nil {
				t.Fatal("unsafe configuration accepted")
			}
		})
	}
}

type failedEntropy struct{}

func (failedEntropy) Read([]byte) (int, error) { return 0, errors.New("synthetic random failure") }

func TestEntropyFailureCannotReturnPartialConfiguration(t *testing.T) {
	out, err := prepare([]byte("EXISTING=keep\n"), contact, true, failedEntropy{})
	if err == nil || out != nil {
		t.Fatal("failed randomness produced configuration")
	}
}

func TestSubjectValidation(t *testing.T) {
	for _, subject := range []string{contact, "mailto:admin@example.test"} {
		if !validSubject(subject) {
			t.Fatal("valid contact rejected")
		}
	}
	for _, subject := range []string{"", "http://example.test", "https://", "mailto:invalid", "https://example.test\nKEY=x"} {
		if validSubject(subject) {
			t.Fatal("invalid contact accepted")
		}
	}
}

func TestAtomicWriteBacksUpAndRepeatedRunDoesNotRotate(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "service.env")
	original := []byte("EXISTING_SECRET=sentinel_not_for_output\n")
	if err := os.WriteFile(path, original, 0600); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := run([]string{"--env-file", path, "--enable"}, &output); err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	v := keys(t, body)
	if !validPair(v[publicName], v[privateName]) || v[enabledName] != "true" {
		t.Fatal("configuration not installed")
	}
	for _, secret := range []string{v[privateName], v[publicName], "sentinel_not_for_output"} {
		if strings.Contains(output.String(), secret) {
			t.Fatal("output leaked configuration values")
		}
	}
	backups, _ := filepath.Glob(path + ".pre-push-*")
	if len(backups) != 1 {
		t.Fatal("expected one configuration backup")
	}
	saved, err := os.ReadFile(backups[0])
	if err != nil || !bytes.Equal(saved, original) {
		t.Fatal("backup did not preserve exact original bytes")
	}
	if runtime.GOOS != "windows" {
		for _, name := range []string{path, backups[0]} {
			stat, err := os.Stat(name)
			if err != nil || stat.Mode().Perm() != 0600 {
				t.Fatal("file permissions are not private")
			}
		}
	}
	output.Reset()
	if err := run([]string{"--env-file", path, "--enable"}, &output); err != nil || output.String() != "PUSH_CONFIG=unchanged\n" {
		t.Fatal("repeated invocation is not a no-op")
	}
	current, _ := os.ReadFile(path)
	backups, _ = filepath.Glob(path + ".pre-push-*")
	if !bytes.Equal(body, current) || len(backups) != 1 {
		t.Fatal("repeated invocation changed material or backup")
	}
}

func TestInvalidExistingPairLeavesFileUntouched(t *testing.T) {
	path := filepath.Join(t.TempDir(), "service.env")
	original := []byte(privateName + "=do_not_print_this\n")
	os.WriteFile(path, original, 0600)
	var output bytes.Buffer
	if err := run([]string{"--env-file", path}, &output); err == nil || output.Len() != 0 {
		t.Fatal("invalid pair was accepted or printed")
	}
	current, _ := os.ReadFile(path)
	backups, _ := filepath.Glob(path + ".pre-push-*")
	if !bytes.Equal(original, current) || len(backups) != 0 {
		t.Fatal("invalid pair was modified")
	}
}

func TestConcurrentChangeIsNotOverwritten(t *testing.T) {
	path := filepath.Join(t.TempDir(), "service.env")
	os.WriteFile(path, []byte("ORIGINAL=true\n"), 0600)
	changed := []byte("CHANGED_BY_OPERATOR=true\n")
	_, err := configure(options{path: path, subject: contact}, func() { os.WriteFile(path, changed, 0600) })
	if err == nil {
		t.Fatal("concurrent change accepted")
	}
	current, _ := os.ReadFile(path)
	if !bytes.Equal(current, changed) {
		t.Fatal("concurrent edit overwritten")
	}
}

func TestLockAndMissingFileFailClosed(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "service.env")
	if _, err := configure(options{path: path, subject: contact}, nil); err == nil {
		t.Fatal("missing environment file created")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("missing file appeared")
	}
	os.WriteFile(path, []byte("KEEP=true\n"), 0600)
	os.WriteFile(path+".push-config.lock", []byte(""), 0600)
	if _, err := configure(options{path: path, subject: contact}, nil); err == nil {
		t.Fatal("existing lock ignored")
	}
}

func TestSymlinkEnvironmentIsRejected(t *testing.T) {
	dir := t.TempDir()
	original := filepath.Join(dir, "original.env")
	path := filepath.Join(dir, "link.env")
	os.WriteFile(original, []byte("KEEP=true\n"), 0600)
	if err := os.Symlink(original, path); err != nil {
		t.Skip("host cannot create symlinks")
	}
	if _, err := configure(options{path: path, subject: contact}, nil); err == nil {
		t.Fatal("symlink environment accepted")
	}
	body, _ := os.ReadFile(original)
	if string(body) != "KEEP=true\n" {
		t.Fatal("symlink target changed")
	}
}

func TestArgumentsCannotLeakUnknownValues(t *testing.T) {
	var out bytes.Buffer
	if err := run([]string{"--private-key=SECRET_SHOULD_NOT_PRINT"}, &out); err == nil || out.Len() != 0 {
		t.Fatal("argument parsing exposed input")
	}
}
