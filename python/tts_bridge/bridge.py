"""Minimal JSON bridge for explicit non-OmniVoice TTS providers."""

import asyncio
import json
import sys
from pathlib import Path


def generate_gtts(text: str, voice_id: str, output_path: Path) -> None:
    from gtts import gTTS

    gTTS(text=text, lang=voice_id or "vi", slow=False).save(str(output_path))


async def generate_edge(text: str, voice_id: str, output_path: Path) -> None:
    import edge_tts

    voice = voice_id or "vi-VN-HoaiMyNeural"
    await edge_tts.Communicate(text, voice).save(str(output_path))


def generate_kokoro(text: str, voice_id: str, output_path: Path) -> None:
    import soundfile as sf
    import torch
    from kokoro_vietnamese import KokoroVietnamese
    from kokoro_vietnamese.core import (
        DEFAULT_HF_REPO_ID,
        DEFAULT_VOICEPACK_FILE,
        _download_or_resolve,
        resolve_voicepack_filename,
    )

    pipeline = KokoroVietnamese(device="cpu")
    voicepack_name = resolve_voicepack_filename(voice_id or "diem_trinh", None)
    voicepack_path = _download_or_resolve(DEFAULT_HF_REPO_ID, DEFAULT_VOICEPACK_FILE, voicepack_name)
    pipeline.voicepack = torch.load(voicepack_path, map_location="cpu", weights_only=True)
    audio, _ = pipeline.synthesize(text)
    if audio is None:
        raise RuntimeError("Kokoro returned no audio")
    sf.write(output_path, audio, 24000)


def main() -> int:
    request = json.load(sys.stdin)
    provider = request.get("provider")
    text = request.get("text")
    voice_id = request.get("voiceId", "")
    output_path = Path(request.get("outputPath", ""))
    if provider not in {"edge-tts", "gtts", "kokoro-vietnamese"} or not isinstance(text, str) or not text.strip() or not output_path.name:
        raise ValueError("invalid TTS bridge request")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if provider == "edge-tts":
        asyncio.run(generate_edge(text, voice_id, output_path))
    elif provider == "gtts":
        generate_gtts(text, voice_id, output_path)
    else:
        generate_kokoro(text, voice_id, output_path)
    if not output_path.exists() or output_path.stat().st_size <= 100:
        raise RuntimeError("provider did not create audio")
    print(json.dumps({"ok": True}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
