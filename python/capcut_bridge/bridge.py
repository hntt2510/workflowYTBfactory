from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from pycapcut import AudioSegment, DraftFolder, TextSegment, TextStyle, Timerange, TrackType, VideoSegment


def require_int(value: Any, name: str, minimum: int = 1) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
        raise ValueError(f"{name} must be an integer >= {minimum}")
    return value


def require_media_item(value: Any, name: str) -> tuple[Path, Timerange]:
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be an object")
    path = Path(value.get("filePath", ""))
    if not path.is_file():
        raise ValueError(f"{name}.filePath does not exist")
    return path, Timerange(
        require_int(value.get("startUs"), f"{name}.startUs", 0),
        require_int(value.get("durationUs"), f"{name}.durationUs"),
    )


def create_draft(payload: dict[str, Any]) -> dict[str, Any]:
    draft_dir = Path(payload["draftDirectory"])
    if draft_dir.exists():
        raise FileExistsError("Draft directory already exists; create a backup before replacing it.")
    canvas = payload.get("canvas")
    if not isinstance(canvas, dict):
        raise ValueError("canvas is required")
    width = require_int(canvas.get("width"), "canvas.width")
    height = require_int(canvas.get("height"), "canvas.height")
    fps = require_int(canvas.get("fps"), "canvas.fps")

    timeline = payload.get("timeline")
    if not isinstance(timeline, dict):
        raise ValueError("timeline is required")
    visuals = timeline.get("visuals", [])
    audio = timeline.get("audio", [])
    subtitles = timeline.get("subtitles", [])
    if not isinstance(visuals, list) or not visuals:
        raise ValueError("timeline.visuals must contain approved media")
    if not isinstance(audio, list) or not audio:
        raise ValueError("timeline.audio must contain approved media")
    if not isinstance(subtitles, list):
        raise ValueError("timeline.subtitles must be an array")

    draft_dir.parent.mkdir(parents=True, exist_ok=True)
    script = DraftFolder(str(draft_dir.parent)).create_draft(draft_dir.name, width, height, fps)
    script.add_track(TrackType.video, "primary_visual")
    script.add_track(TrackType.audio, "narration")
    if subtitles:
        script.add_track(TrackType.text, "subtitles")

    for index, item in enumerate(visuals):
        media_path, timerange = require_media_item(item, f"timeline.visuals[{index}]")
        script.add_segment(VideoSegment(str(media_path), timerange), "primary_visual")
    for index, item in enumerate(audio):
        media_path, timerange = require_media_item(item, f"timeline.audio[{index}]")
        script.add_segment(AudioSegment(str(media_path), timerange), "narration")
    for index, item in enumerate(subtitles):
        if not isinstance(item, dict) or not isinstance(item.get("text"), str) or not item["text"].strip():
            raise ValueError(f"timeline.subtitles[{index}] must have text")
        timerange = Timerange(
            require_int(item.get("startUs"), f"timeline.subtitles[{index}].startUs", 0),
            require_int(item.get("durationUs"), f"timeline.subtitles[{index}].durationUs"),
        )
        script.add_segment(TextSegment(item["text"], timerange, style=TextStyle(size=12.0, bold=True)), "subtitles")
    script.save()

    content_path = draft_dir / "draft_content.json"
    content = json.loads(content_path.read_text(encoding="utf-8"))
    tracks = content.get("tracks", [])
    track_counts = {track_type: sum(track.get("type") == track_type for track in tracks) for track_type in ("video", "audio", "text")}
    if track_counts["video"] != 1 or track_counts["audio"] != 1 or (subtitles and track_counts["text"] != 1):
        raise RuntimeError("Draft track validation failed")
    return {
        "ok": True,
        "structurallyValidated": True,
        "draftDirectory": str(draft_dir),
        "contentPath": str(content_path),
        "trackCounts": track_counts,
    }


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise ValueError("Bridge input must be an object")
        print(json.dumps(create_draft(payload)))
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
