# CapCut Compatibility

Status: adapter boundary and manifest bridge are implemented; full `pycapcut` draft writing is not yet validated.

- Tested CapCut version: not yet recorded.
- Tested `pycapcut` version: not yet pinned.
- Supported MVP operation: emit a machine-readable draft manifest.
- Unsupported: automated TTS inside CapCut, screen-coordinate automation, guaranteed schema compatibility.
- Draft location: configured with `CAPCUT_DRAFT_DIR`.
- Backup: copy the entire target draft folder before overwriting.

Schema risk is isolated behind `CapCutDraftAdapter`.

