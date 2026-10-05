//go:build linux

package main

import (
	"runtime"
	"syscall"
)

// lowerThreadPriority nices the calling goroutine's thread (Linux priority is
// per thread). The thread stays locked, so when the goroutine ends the runtime
// retires it rather than handing a niced thread to other work.
func lowerThreadPriority() {
	runtime.LockOSThread()
	_ = syscall.Setpriority(syscall.PRIO_PROCESS, syscall.Gettid(), 10)
}
