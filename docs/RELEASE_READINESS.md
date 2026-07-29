# Release Readiness

## Conclusion

Release state: **INTERNAL_TESTING_ONLY**

Batch 1 persistence and security foundation is implemented, but the product remains **INTERNAL_TESTING_ONLY** because real generation, preview rendering, and CapCut export are still incomplete.

## Gate Status

| Gate | Status | Evidence |
|---|---|---|
| Install | PASS | `pnpm install` passed |
| Typecheck | PASS | `pnpm typecheck` passed |
| Unit tests | PASS | 24 tests passed |
| Build | PASS | desktop renderer build passed |
| Lint | PASS | `pnpm lint` passed |
| Project persistence | PASS | SQLite migrations and restart-persistence tests passed |
| Real image generation | FAIL | no 9Router request flow |
| Asset storage | FAIL | no runtime flow |
| FFmpeg preview | FAIL | no runtime flow |
| CapCut editable draft | FAIL | manifest-only, no pycapcut |
| Security | PARTIAL | IPC validation, keychain references, and redaction added; provider execution path still deferred |
| Admin UI | PARTIAL | dark routed admin shell added; renderer screenshots captured; automated Electron DOM create/restart verifier passes |
| Export/import | FAIL | missing |

## Top Five Fixes

1. Implement real 9Router image request execution through the five-worker queue.
2. Implement asset download/decode/save/hash/DB/shot assignment.
3. Implement FFmpeg preview from timeline assets and audio.
4. Implement real CapCut sidecar export with pycapcut fixtures.
5. Add packaging/export/import after the generation path is real.

## Reproduce Audit

```powershell
codegraph status
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm --filter @lsf/desktop build
python --version
python -m pip show pycapcut
ffmpeg -version
```
