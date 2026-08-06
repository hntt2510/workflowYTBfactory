# Creator Studio V1 Fixture

The fixture in `fixtures/creator-studio-v1` is a deterministic local acceptance sample for the manual-first creator workflow.

It covers one short project with three scenes and ten storyboard frames:

- one recurring teacher character with expression and pose changes;
- one `REUSE` frame, one money cutaway, and one explanatory chart;
- a 30 FPS vertical timeline with motion metadata;
- synthetic voice, music, SFX, and UTF-8 subtitles;
- a real H.264/yuv420p MP4 validated with FFprobe.

The media files are intentionally synthetic. They prove the timeline and codec contract without calling a provider or pretending that generated artwork is user-approved.

## Regenerate locally

From the repository root, use FFmpeg to create the ten frame PNGs, three WAV tracks, subtitle file, and `creator-studio-v1.mp4` described by the manifest. The committed manifest is the source of truth; generated media is disposable and can be recreated in a temporary workspace for QA.

## Verify

```powershell
ffprobe -v error -show_entries stream=codec_name,codec_type,width,height,pix_fmt -show_entries format=duration -of json fixtures/creator-studio-v1/creator-studio-v1.mp4
```

Expected output includes a 1080x1920 H.264 video stream, `yuv420p`, an AAC audio stream, and approximately ten seconds of duration.
