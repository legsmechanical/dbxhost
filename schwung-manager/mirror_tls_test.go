package main

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func leafOf(t *testing.T, c tls.Certificate) *x509.Certificate {
	t.Helper()
	leaf, err := x509.ParseCertificate(c.Certificate[0])
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	return leaf
}

// The browser's acceptance of the certificate is per certificate, so the one
// made at first launch must be the one served at every launch after.
func TestMirrorCertificateIsKeptAcrossLaunches(t *testing.T) {
	dir := t.TempDir()
	first, err := mirrorCertificate(dir)
	if err != nil {
		t.Fatal(err)
	}
	second, err := mirrorCertificate(dir)
	if err != nil {
		t.Fatal(err)
	}
	if leafOf(t, first).SerialNumber.Cmp(leafOf(t, second).SerialNumber) != 0 {
		t.Error("a second launch made a new certificate: the browser would warn again every time")
	}
	st, err := os.Stat(filepath.Join(dir, mirrorKeyFile))
	if err != nil {
		t.Fatal(err)
	}
	if st.Mode().Perm() != 0o600 {
		t.Errorf("key file mode %v, want 0600", st.Mode().Perm())
	}
}

// A half-written or damaged pair is replaced, never fatal.
func TestMirrorCertificateRemadeWhenUnreadable(t *testing.T) {
	dir := t.TempDir()
	first, err := mirrorCertificate(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, mirrorCertFile), []byte("not a certificate"), 0o644); err != nil {
		t.Fatal(err)
	}
	again, err := mirrorCertificate(dir)
	if err != nil {
		t.Fatalf("a damaged certificate was fatal: %v", err)
	}
	if leafOf(t, first).SerialNumber.Cmp(leafOf(t, again).SerialNumber) == 0 {
		t.Error("the damaged certificate was not replaced")
	}
	if _, err := tls.LoadX509KeyPair(filepath.Join(dir, mirrorCertFile), filepath.Join(dir, mirrorKeyFile)); err != nil {
		t.Errorf("the replacement on disk does not load: %v", err)
	}
}

// Nowhere to keep it (or a read-only disk) still gives a working certificate.
func TestMirrorCertificateWithoutADirectory(t *testing.T) {
	if _, err := mirrorCertificate(""); err != nil {
		t.Fatal(err)
	}
	if _, err := mirrorCertificate(filepath.Join(t.TempDir(), "missing", "dir")); err != nil {
		t.Fatalf("an unwritable directory was fatal: %v", err)
	}
}

// The dates do not depend on the device's clock, and the names are the ones a
// browser reaches the device by.
func TestMirrorCertificateShape(t *testing.T) {
	c, err := mirrorCertificate("")
	if err != nil {
		t.Fatal(err)
	}
	leaf := leafOf(t, c)
	if !leaf.NotBefore.Before(time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("NotBefore %v follows the clock; a device with a wrong clock would make a not-yet-valid certificate", leaf.NotBefore)
	}
	if leaf.NotAfter.Before(time.Date(2040, 1, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("NotAfter %v: it would expire in use", leaf.NotAfter)
	}
	if err := leaf.VerifyHostname("move.local"); err != nil {
		t.Errorf("not valid for move.local: %v", err)
	}
	if err := leaf.VerifyHostname("172.16.254.1"); err != nil {
		t.Errorf("not valid for the tether address: %v", err)
	}
}

// It really does serve TLS.
func TestMirrorCertificateServes(t *testing.T) {
	c, err := mirrorCertificate("")
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, "ok") }))
	srv.TLS = &tls.Config{Certificates: []tls.Certificate{c}, MinVersion: tls.VersionTLS12}
	srv.StartTLS()
	defer srv.Close()
	client := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}
	res, err := client.Get(srv.URL)
	if err != nil {
		t.Fatalf("handshake: %v", err)
	}
	defer res.Body.Close()
	if b, _ := io.ReadAll(res.Body); string(b) != "ok" {
		t.Errorf("body %q", b)
	}
}

// The page sends the browser to a port by number; it must be the one the
// manager listens on.
func TestMirrorPageKnowsTheSecurePort(t *testing.T) {
	page, err := staticFS.ReadFile("static/mirror.html")
	if err != nil {
		t.Fatal(err)
	}
	if want := fmt.Sprintf("const SECURE_PORT = %d;", mirrorTLSPortDefault); !strings.Contains(string(page), want) {
		t.Errorf("mirror.html does not say %q", want)
	}
}
