"""Long-lived local TTS worker using newline-delimited JSON messages."""

import asyncio
import json
import os
import sys
import tempfile
import traceback
from pathlib import Path

# Electron writes UTF-8 JSON to pipes; Windows otherwise defaults redirected Python I/O to cp1252.
sys.stdin.reconfigure(encoding="utf-8", errors="surrogatepass")
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")


EDGE_VOICES = [
    {"id": "vi-VN-HoaiMyNeural", "label": "HoaiMy", "language": "vi", "gender": "female", "description": "Vietnamese neural female voice"},
    {"id": "vi-VN-NamMinhNeural", "label": "NamMinh", "language": "vi", "gender": "male", "description": "Vietnamese neural male voice"},
]
KOKORO_VOICES = [
    {"id": voice, "label": voice.replace("_", " ").title(), "language": "vi", "gender": "female" if voice in {"diem_trinh", "mai_linh", "mai_loan", "my_yen", "ngoc_huyen", "thuc_trinh"} else "male", "description": "Local Vietnamese voicepack"}
    for voice in ("diem_trinh", "mai_linh", "mai_loan", "my_yen", "ngoc_huyen", "thuc_trinh", "hung_thinh", "manh_dung", "phat_tai", "thanh_dat", "tuan_ngoc", "duc_an", "duc_duy", "storyvert")
]


class LocalTtsWorker:
    def __init__(self):
        self.kokoro = None
        self.kokoro_voicepacks = {}

    async def health(self, provider, probe=False):
        try:
            if provider == "edge-tts":
                import edge_tts  # noqa: F401
            elif provider == "gtts":
                from gtts import gTTS  # noqa: F401
            elif provider == "kokoro-vietnamese":
                from kokoro_vietnamese import KokoroVietnamese  # noqa: F401
            else:
                return {"ready": False, "message": "Unsupported local provider."}
            if not probe:
                return {"ready": True, "message": "Dependency is available; run a health check to probe synthesis."}
            suffix = ".wav" if provider == "kokoro-vietnamese" else ".mp3"
            file_descriptor, output_path = tempfile.mkstemp(prefix="lsf-tts-health-", suffix=suffix)
            os.close(file_descriptor)
            os.unlink(output_path)
            try:
                defaults = {
                    "edge-tts": "vi-VN-HoaiMyNeural",
                    "gtts": "vi",
                    "kokoro-vietnamese": "diem_trinh",
                }
                await self.synthesize({
                    "provider": provider,
                    "text": "Xin chao.",
                    "voiceId": defaults[provider],
                    "language": "vi",
                    "rate": 1.0,
                    "outputPath": output_path,
                })
            finally:
                if os.path.exists(output_path):
                    os.unlink(output_path)
            return {"ready": True, "message": "A live synthesis probe completed successfully."}
        except Exception as error:
            return {"ready": False, "message": str(error).split("\n", 1)[0][:300]}

    async def list_voices(self, provider, language):
        if provider == "edge-tts":
            try:
                import edge_tts
                language_code = language.lower().split("-", 1)[0]
                voices = await edge_tts.list_voices()
                return [{
                    "id": voice["ShortName"],
                    "label": voice.get("FriendlyName", voice["ShortName"]),
                    "language": language_code,
                    "gender": voice.get("Gender", "Unknown").lower() if voice.get("Gender", "Unknown").lower() in {"female", "male", "neutral"} else "unknown",
                    "description": f"{voice.get('Locale', language_code)} neural voice",
                } for voice in voices if voice.get("Locale", "").lower().split("-", 1)[0] == language_code]
            except Exception:
                return [voice for voice in EDGE_VOICES if voice["language"] == language]
        if provider == "gtts":
            return [{"id": language, "label": f"Google {language}", "language": language, "gender": "unknown", "description": "Google TTS language voice"}]
        if provider == "kokoro-vietnamese":
            if language != "vi":
                return []
            try:
                from kokoro_vietnamese import list_voices
                known = {voice["id"]: voice for voice in KOKORO_VOICES}
                return [known.get(voice_id, {
                    "id": voice_id,
                    "label": voice_id.replace("_", " ").title(),
                    "language": "vi",
                    "gender": "unknown",
                    "description": "Local Vietnamese voicepack",
                }) for voice_id in list_voices()]
            except Exception:
                return KOKORO_VOICES
        return []

    async def synthesize(self, request):
        provider = request["provider"]
        # Drop malformed lone Unicode surrogates before providers encode text as UTF-8.
        text = request["text"].encode("utf-8", "ignore").decode("utf-8").strip()
        voice_id = request["voiceId"]
        language = request["language"]
        rate = float(request.get("rate", 1.0))
        output_path = Path(request["outputPath"])
        if not text:
            raise ValueError("Text is empty.")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if provider == "edge-tts":
            import edge_tts
            voice_language = voice_id.split("-", 1)[0].lower()
            requested_language = language.lower().split("-", 1)[0]
            if voice_language != requested_language:
                raise ValueError(f"Selected Edge voice ({voice_id}) does not match language ({language}). Refresh voices and choose a matching voice.")
            percentage = round((rate - 1.0) * 100)
            await edge_tts.Communicate(text, voice_id, rate=f"{percentage:+d}%").save(str(output_path))
        elif provider == "gtts":
            from gtts import gTTS
            gTTS(text=text, lang=voice_id or language, slow=False).save(str(output_path))
        elif provider == "kokoro-vietnamese":
            self._synthesize_kokoro(text, voice_id, output_path)
        else:
            raise ValueError("Unsupported local provider.")
        if not output_path.exists() or output_path.stat().st_size <= 100:
            raise RuntimeError("Provider did not create an audio file.")
        return {"outputPath": str(output_path)}

    def _synthesize_kokoro(self, text, voice_id, output_path):
        import soundfile as sf
        import torch
        from kokoro_vietnamese import KokoroVietnamese
        from kokoro_vietnamese.core import DEFAULT_HF_REPO_ID, DEFAULT_VOICEPACK_FILE, _download_or_resolve, resolve_voicepack_filename

        if self.kokoro is None:
            self.kokoro = KokoroVietnamese(device=os.environ.get("TTS_KOKORO_DEVICE", "cpu"))
        if voice_id not in self.kokoro_voicepacks:
            voicepack_name = resolve_voicepack_filename(voice_id, None)
            voicepack_path = _download_or_resolve(DEFAULT_HF_REPO_ID, DEFAULT_VOICEPACK_FILE, voicepack_name)
            self.kokoro_voicepacks[voice_id] = torch.load(voicepack_path, map_location="cpu", weights_only=True)
        self.kokoro.voicepack = self.kokoro_voicepacks[voice_id]
        audio, _ = self.kokoro.synthesize(text)
        if audio is None:
            raise RuntimeError("Kokoro returned no audio.")
        sf.write(output_path, audio, 24000)


def response(request_id, ok, result=None, error=None):
    return {"id": request_id, "ok": ok, **({"result": result} if result is not None else {}), **({"error": error} if error else {})}


async def main():
    worker = LocalTtsWorker()
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            request_id = request.get("id")
            action = request.get("action")
            if not request_id or action not in {"health", "listVoices", "synthesize"}:
                raise ValueError("Invalid worker request.")
            if action == "health":
                result = await worker.health(request.get("provider"), bool(request.get("probe")))
            elif action == "listVoices":
                result = await worker.list_voices(request.get("provider"), request.get("language", "vi"))
            else:
                result = await worker.synthesize(request)
            print(json.dumps(response(request_id, True, result), ensure_ascii=False), flush=True)
        except Exception as error:
            print(json.dumps(response(request.get("id", "unknown"), False, error=str(error).split("\n", 1)[0][:1000]), ensure_ascii=False), flush=True)
            traceback.print_exc(file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
