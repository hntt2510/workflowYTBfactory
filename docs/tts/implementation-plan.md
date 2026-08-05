# TTS Implementation Plan

## Default path

Vietnamese narration defaults to direct Microsoft Edge Neural with `vi-VN-HoaiMyNeural`. `vi-VN-NamMinhNeural` is also available. Text is normalized to Unicode NFC and is never transliterated.

## Reliability rules

- Edge retries transient failures three times with exponential backoff.
- Strict mode is the default: a failed provider remains failed.
- Fallback runs only when the user enables it and every segment records the actual provider.
- All provider output is validated with FFprobe before it becomes a result.
- Preview audio is cached by provider, voice, language, rate, and normalized text.

## Workflow jobs

Voice Generation creates a persistent job with one timestamped segment for each approved script section. Estimated script duration supplies sequential start/end timestamps when no subtitle timing exists. Jobs can be polled, cancelled, and retried per failed segment.

If an output overruns its planned slot, FFmpeg can speed it up only through `1.8x`. Larger overflow remains visible for review. Successful segments are merged into a delayed FFmpeg voiceover track that preserves intentional silence.
