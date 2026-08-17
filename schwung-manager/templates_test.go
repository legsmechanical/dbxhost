// Smoke test for template loading — catches template syntax errors and a
// page accidentally dropped from the embed without needing a device.

package main

import "testing"

func TestLoadTemplates(t *testing.T) {
	m, err := loadTemplates()
	if err != nil {
		t.Fatalf("loadTemplates: %v", err)
	}
	required := []string{
		"waiting.html",
		"files.html",
		"config.html",
		"system.html",
		"help.html",
	}
	for _, name := range required {
		if _, ok := m[name]; !ok {
			t.Errorf("missing template %q", name)
		}
	}
}
