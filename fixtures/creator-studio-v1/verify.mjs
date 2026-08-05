import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const requiredFiles = [
  manifest.audio.voice,
  manifest.audio.music,
  manifest.audio.sfx,
  manifest.audio.subtitles,
  ...manifest.frames.map((frame) => join("frames", `${frame.number}.png`)),
  manifest.output.mp4
];
const missing = requiredFiles.filter((file) => !existsSync(join(root, file)));
if (missing.length) throw new Error(`Fixture is missing: ${missing.join(", ")}`);

const probe = JSON.parse(execFileSync("ffprobe", [
  "-v", "error",
  "-show_entries", "stream=codec_name,codec_type,width,height,pix_fmt",
  "-show_entries", "format=duration",
  "-of", "json",
  resolve(root, manifest.output.mp4)
], { encoding: "utf8" }));
const video = probe.streams?.find((stream) => stream.codec_type === "video");
const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
if (!video || video.codec_name !== manifest.output.expectedVideoCodec || video.width !== manifest.output.expectedWidth || video.height !== manifest.output.expectedHeight || video.pix_fmt !== manifest.output.expectedPixelFormat) {
  throw new Error("Fixture video stream does not match the manifest contract.");
}
if (!audio || audio.codec_name !== manifest.output.expectedAudioCodec) throw new Error("Fixture audio stream does not match the manifest contract.");
if (Math.abs(Number(probe.format?.duration) - manifest.targetDurationSeconds) > 0.1) throw new Error("Fixture duration does not match the manifest contract.");
console.log(JSON.stringify({ projectId: manifest.projectId, scenes: manifest.scenes.length, frames: manifest.frames.length, durationSeconds: Number(probe.format.duration), video: `${video.width}x${video.height} ${video.codec_name}/${video.pix_fmt}`, audio: audio.codec_name }));
