# TTS Architecture

```text
Renderer Settings / Voice screen
  -> Electron IPC (validated Zod contracts)
  -> TtsManager registry
       -> persistent Python worker: Edge, gTTS, Kokoro
       -> 9Router TTS service (optional credentialed provider)
       -> CapCut experimental adapter (disabled)
  -> TtsJobService + SQLite tts_jobs / tts_job_segments
  -> FFprobe validation, FFmpeg timing fit and delayed merge
  -> Voice Generation artifact + subtitle/timeline timestamps
```

The renderer never receives an API key or authorization header. The only cloud credential is resolved in Electron main before the optional 9Router request.

`python/tts_bridge/worker.py` is a newline-delimited JSON process kept alive by `TtsWorkerClient`. Kokoro is lazy-loaded and its voicepacks are retained in process memory. Kokoro first produces WAV; Electron normalizes it to MP3 with FFmpeg rather than storing WAV bytes under an MP3 filename.

OmniVoice design and clone remain separate UI modes, but their workflow segments use the same persistent job, FFprobe, timing, and merge path. OmniVoice is not presented as a sixth integrated-provider registry entry.
