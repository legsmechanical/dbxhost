/*
 * file_atomic.h — crash-atomic whole-file writes.
 *
 * Any file that is rewritten in place is torn by a power cut: from the moment
 * the destination is truncated until the last byte lands, the only copy on
 * disk is a fragment. For state files whose readers parse tolerantly, that
 * fragment is not a detectable error — it loads as a smaller project, a
 * shorter list, a config missing whatever the cut removed.
 *
 * schwung_write_file_atomic() removes the window: it fills a sibling temp
 * file, flushes it to the medium, and renames it over the destination.
 */
#ifndef SCHWUNG_FILE_ATOMIC_H
#define SCHWUNG_FILE_ATOMIC_H

#include <stddef.h>

/* Write `len` bytes of `data` to `path` via a temp sibling + fsync + rename,
 * so a crash leaves either the complete previous contents or the complete new
 * contents — never a mixture, and never an empty file.
 *
 * The temp file is "<path>.tmp", a sibling so that it is guaranteed to be on
 * the same filesystem as the destination (rename(2) is only atomic within
 * one). It is removed on every failure path, so a failed write leaves nothing
 * behind but the untouched destination.
 *
 * The containing directory is deliberately NOT fsynced. That would only decide
 * WHICH of the two valid files survives a crash, at the cost of a second
 * synchronous flush on paths that run at autosave cadence; losing the newest
 * write is acceptable, loading half of it is not.
 *
 * Ownership and permissions come from the newly created file (mode 0644 &
 * umask), as with any create-and-rename — an existing destination's mode is
 * not preserved.
 *
 * Returns 0 on success, -1 on failure (destination untouched).
 */
int schwung_write_file_atomic(const char *path, const char *data, size_t len);

#endif /* SCHWUNG_FILE_ATOMIC_H */
