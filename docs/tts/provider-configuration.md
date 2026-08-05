# Provider Configuration

## Edge TTS (default)

Install `edge-tts` in the Python environment selected by `TTS_PYTHON_PATH` or `python/tts_bridge/.venv/Scripts/python.exe`. Select **Integrated voices**, provider **Microsoft Edge Neural**, language `vi`, and a Vietnamese Neural voice. Use **Run health check** to perform a real synthesis probe.

## Other providers

- `kokoro-vietnamese`: local optional provider. It lazy-loads only when requested.
- `gtts`: cloud optional provider using the selected language code.
- `nine-router-tts`: optional. Save its credential in Settings; the renderer never stores or displays the secret.
- `capcut-experimental`: intentionally disabled.

Enable fallback only when a substitute voice is acceptable. The job and artifact display both requested and actual provider, plus the reason fallback occurred.
