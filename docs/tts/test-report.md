# TTS Test Report

The automated suite covers the provider registry, strict no-fallback behavior, explicit fallback disclosure, Edge retry behavior, preview cache reuse, TTS job persistence, partial batch failure, retrying a segment, OmniVoice job compatibility, and timing overflow above the `1.8x` cap. On 2026-07-30, the full suite passed: 37 files and 146 tests.

Run verification from the repository root:

```powershell
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm --filter @lsf/desktop build
```

For a live Vietnamese smoke test, configure Edge TTS in Settings, choose `vi-VN-HoaiMyNeural` or `vi-VN-NamMinhNeural`, preview a sentence containing Vietnamese diacritics, and verify the resulting MP3 with FFprobe.

The direct Edge smoke test completed on this machine with `vi-VN-HoaiMyNeural`; FFprobe reported an MP3 audio stream with a `5.952` second duration. The generated file is `workspace/dev-test-lab/voice/edge-vietnamese-smoke-20260730.mp3`.
