// push-config creates VAPID material on the server. It never prints key values.
package main

import (
	"bytes"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const publicName = "BUSINESS_PUSH_VAPID_PUBLIC_KEY"
const privateName = "BUSINESS_PUSH_VAPID_PRIVATE_KEY"
const subjectName = "BUSINESS_PUSH_VAPID_SUBJECT"
const enabledName = "BUSINESS_PUSH_ENABLED"

var configNames = map[string]bool{publicName: true, privateName: true, subjectName: true, enabledName: true}

type options struct {
	path    string
	subject string
	enable  bool
}

type result struct {
	status string
	backup string
}

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		// Parse/filesystem/crypto errors may contain user input. Return only a fixed
		// operator message; the existing file and any backup remain on the host.
		fmt.Fprintln(os.Stderr, "PUSH_CONFIG_FAILED=configuration_not_safely_updated")
		os.Exit(1)
	}
}

func run(args []string, out io.Writer) error {
	flags := flag.NewFlagSet("push-config", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	var opts options
	flags.StringVar(&opts.path, "env-file", "/etc/business-control.env", "Existing service EnvironmentFile")
	flags.StringVar(&opts.subject, "subject", "https://control.e-rd.ru", "VAPID contact for a missing subject")
	flags.BoolVar(&opts.enable, "enable", false, "Explicitly enable the push worker")
	if err := flags.Parse(args); err != nil {
		return errors.New("invalid arguments")
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected arguments")
	}
	answer, err := configure(opts, nil)
	if err != nil {
		return err
	}
	fmt.Fprintln(out, "PUSH_CONFIG="+answer.status)
	if answer.backup != "" {
		fmt.Fprintln(out, "PUSH_CONFIG_BACKUP="+answer.backup)
	}
	return nil
}

// The critical assignments deliberately accept only one physical line each.
// Other settings/comments are preserved byte-for-byte, without shell execution.
func parseConfig(body []byte) (map[string]string, map[string]int, []string, error) {
	if bytes.IndexByte(body, 0) >= 0 {
		return nil, nil, nil, errors.New("invalid environment file")
	}
	lines := strings.Split(string(body), "\n")
	values, positions := map[string]string{}, map[string]int{}
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}
		if strings.HasSuffix(line, "\\") {
			return nil, nil, nil, errors.New("continued environment assignments require operator review")
		}
		key, value, assigned := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		if strings.HasPrefix(key, "export ") && configNames[strings.TrimSpace(strings.TrimPrefix(key, "export "))] {
			return nil, nil, nil, errors.New("unsupported critical assignment")
		}
		if !configNames[key] {
			continue
		}
		if _, duplicate := positions[key]; duplicate || !assigned {
			return nil, nil, nil, errors.New("ambiguous critical assignment")
		}
		value = strings.TrimSpace(value)
		if strings.HasPrefix(value, "\"") {
			decoded, err := strconv.Unquote(value)
			if err != nil {
				return nil, nil, nil, errors.New("invalid critical quoting")
			}
			value = decoded
		} else if strings.HasPrefix(value, "'") {
			if len(value) < 2 || !strings.HasSuffix(value, "'") || strings.Contains(value[1:len(value)-1], "'") {
				return nil, nil, nil, errors.New("invalid critical quoting")
			}
			value = value[1 : len(value)-1]
		}
		if strings.ContainsAny(value, "\r\n\t \\") {
			return nil, nil, nil, errors.New("unsupported critical value")
		}
		values[key], positions[key] = value, i
	}
	return values, positions, lines, nil
}

func validSubject(value string) bool {
	u, err := url.Parse(value)
	return err == nil && !strings.ContainsAny(value, "\r\n\t ") &&
		((u.Scheme == "https" && u.Hostname() != "" && u.User == nil) ||
			(u.Scheme == "mailto" && strings.Contains(u.Opaque, "@")))
}

func validPair(public, private string) bool {
	secret, err := base64.RawURLEncoding.DecodeString(private)
	if err != nil || len(secret) != 32 {
		return false
	}
	key, err := ecdh.P256().NewPrivateKey(secret)
	if err != nil {
		return false
	}
	pub, err := base64.RawURLEncoding.DecodeString(public)
	return err == nil && len(pub) == 65 && bytes.Equal(pub, key.PublicKey().Bytes())
}

func prepare(body []byte, subject string, enable bool, entropy io.Reader) ([]byte, error) {
	values, positions, lines, err := parseConfig(body)
	if err != nil || !validSubject(subject) {
		return nil, errors.New("invalid environment configuration")
	}
	pub, priv := values[publicName], values[privateName]
	if (pub == "") != (priv == "") {
		return nil, errors.New("incomplete existing pair")
	}
	updates := map[string]string{}
	if pub == "" {
		key, err := ecdh.P256().GenerateKey(entropy)
		if err != nil {
			return nil, errors.New("key generation failed")
		}
		updates[publicName] = base64.RawURLEncoding.EncodeToString(key.PublicKey().Bytes())
		updates[privateName] = base64.RawURLEncoding.EncodeToString(key.Bytes())
	} else if !validPair(pub, priv) {
		return nil, errors.New("existing pair requires operator review")
	}
	if current := values[subjectName]; current == "" {
		updates[subjectName] = subject
	} else if !validSubject(current) {
		return nil, errors.New("existing subject requires operator review")
	}
	if current := values[enabledName]; current != "" {
		if _, err := strconv.ParseBool(current); err != nil {
			return nil, errors.New("existing enable flag requires operator review")
		}
	}
	if enable && values[enabledName] != "true" {
		updates[enabledName] = "true"
	}
	if len(updates) == 0 {
		return bytes.Clone(body), nil
	}
	newline := "\n"
	if bytes.Contains(body, []byte("\r\n")) {
		newline = "\r\n"
	}
	var additions []string
	for _, name := range []string{publicName, privateName, subjectName, enabledName} {
		value, changed := updates[name]
		if !changed {
			continue
		}
		if i, present := positions[name]; present {
			ending := ""
			if strings.HasSuffix(lines[i], "\r") {
				ending = "\r"
			}
			lines[i] = name + "=" + value + ending
		} else {
			additions = append(additions, name+"="+value)
		}
	}
	updated := strings.Join(lines, "\n")
	if len(additions) > 0 {
		if updated != "" && !strings.HasSuffix(updated, "\n") {
			updated += newline
		}
		updated += strings.Join(additions, newline) + newline
	}
	return []byte(updated), nil
}

func configure(opts options, beforeCommit func()) (result, error) {
	if !filepath.IsAbs(opts.path) {
		return result{}, errors.New("absolute environment path required")
	}
	lock, err := os.OpenFile(opts.path+".push-config.lock", os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return result{}, errors.New("configuration lock unavailable")
	}
	lock.Close()
	defer os.Remove(opts.path + ".push-config.lock")
	info, err := os.Lstat(opts.path)
	if err != nil || !info.Mode().IsRegular() {
		return result{}, errors.New("existing regular environment file required")
	}
	body, err := os.ReadFile(opts.path)
	if err != nil {
		return result{}, errors.New("cannot read environment file")
	}
	updated, err := prepare(body, opts.subject, opts.enable, rand.Reader)
	if err != nil {
		return result{}, err
	}
	if bytes.Equal(body, updated) && (runtime.GOOS == "windows" || info.Mode().Perm() == 0600) {
		return result{status: "unchanged"}, nil
	}
	dir, base := filepath.Dir(opts.path), filepath.Base(opts.path)
	backup, err := os.CreateTemp(dir, base+".pre-push-"+time.Now().UTC().Format("20060102T150405Z")+"-*")
	if err != nil {
		return result{}, errors.New("cannot create configuration backup")
	}
	backupName := backup.Name()
	if err := writeSecure(backup, body); err != nil {
		return result{}, errors.New("configuration backup failed")
	}
	if err := syncDirectory(dir); err != nil {
		return result{}, errors.New("cannot make backup durable")
	}
	temp, err := os.CreateTemp(dir, "."+base+".push-config-*")
	if err != nil {
		return result{}, errors.New("cannot stage configuration")
	}
	tempName := temp.Name()
	defer os.Remove(tempName)
	if err := writeSecure(temp, updated); err != nil {
		return result{}, errors.New("cannot stage configuration")
	}
	if beforeCommit != nil {
		beforeCommit()
	}
	current, err := os.Lstat(opts.path)
	if err != nil || !current.Mode().IsRegular() || !os.SameFile(info, current) {
		return result{}, errors.New("configuration changed before commit")
	}
	currentBody, err := os.ReadFile(opts.path)
	if err != nil || !bytes.Equal(currentBody, body) {
		return result{}, errors.New("configuration changed before commit")
	}
	if err := os.Rename(tempName, opts.path); err != nil {
		return result{}, errors.New("cannot commit configuration")
	}
	if err := syncDirectory(dir); err != nil {
		return result{}, errors.New("configuration committed but directory sync failed; inspect before retry")
	}
	return result{status: "updated", backup: backupName}, nil
}

func syncDirectory(dir string) error {
	if runtime.GOOS == "windows" {
		// Production is Linux. Windows tests cannot assert POSIX directory fsync.
		return nil
	}
	folder, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer folder.Close()
	return folder.Sync()
}

func writeSecure(file *os.File, body []byte) error {
	defer file.Close()
	if err := file.Chmod(0600); err != nil {
		return err
	}
	if _, err := file.Write(body); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	return file.Close()
}
