package main

// The mirror over https.
//
// A browser hands a page a microphone only in a SECURE context, and the
// manager is plain http on the LAN. So the mirror -- and only the mirror: the
// page and its stream -- is also served over TLS on its own port, with a
// certificate the manager makes for itself. Nobody vouches for that
// certificate, so the browser warns once and the user accepts it; what it buys
// is not confidentiality but the browser's permission to record narration
// from the computer's own microphone alongside the mirror.
//
// The certificate is kept on disk so the acceptance sticks across launches.
// Its dates are fixed rather than read off the clock: the device has no
// battery-backed clock, and a certificate "not valid until" some time in the
// browser's future would be one more warning for nothing.

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"
)

// mirrorTLSPortDefault is the port the page itself sends a browser to
// (SECURE_PORT in static/mirror.html; mirror_tls_test.go holds them together).
const mirrorTLSPortDefault = 7701

const (
	mirrorCertFile = "mirror-tls.crt"
	mirrorKeyFile  = "mirror-tls.key"
)

// mirrorCertificate returns the certificate kept in dir, making and saving a
// new one if there is none or it cannot be read. With dir == "" (or when it
// cannot be written) the certificate lives for this process only.
func mirrorCertificate(dir string) (tls.Certificate, error) {
	crtPath, keyPath := filepath.Join(dir, mirrorCertFile), filepath.Join(dir, mirrorKeyFile)
	if dir != "" {
		if cert, err := tls.LoadX509KeyPair(crtPath, keyPath); err == nil {
			return cert, nil
		}
	}
	crtPEM, keyPEM, err := newMirrorCertificate()
	if err != nil {
		return tls.Certificate{}, err
	}
	if dir != "" {
		// The key first, and privately; a certificate without its key is
		// simply remade next time.
		if writeFileAtomic(keyPath, keyPEM, 0o600) == nil {
			_ = writeFileAtomic(crtPath, crtPEM, 0o644)
		}
	}
	return tls.X509KeyPair(crtPEM, keyPEM)
}

func newMirrorCertificate() (crtPEM, keyPEM []byte, err error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 120))
	if err != nil {
		return nil, nil, err
	}
	names := []string{"move.local", "localhost"}
	if h, err := os.Hostname(); err == nil && h != "" {
		names = append(names, h, h+".local")
	}
	ips := []net.IP{net.IPv4(127, 0, 0, 1), net.IPv4(172, 16, 254, 1)}
	if addrs, err := net.InterfaceAddrs(); err == nil {
		for _, a := range addrs {
			if n, ok := a.(*net.IPNet); ok && !n.IP.IsLoopback() {
				ips = append(ips, n.IP)
			}
		}
	}
	tmpl := &x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: "move.local mirror"},
		NotBefore:             time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		NotAfter:              time.Date(2045, 1, 1, 0, 0, 0, 0, time.UTC),
		KeyUsage:              x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              names,
		IPAddresses:           ips,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return nil, nil, err
	}
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return nil, nil, err
	}
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}),
		pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}), nil
}

func writeFileAtomic(path string, data []byte, mode os.FileMode) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, mode); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}
