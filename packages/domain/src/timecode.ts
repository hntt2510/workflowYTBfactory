export const DEFAULT_FPS = 30;

export function secondsToFrames(seconds: number, fps = DEFAULT_FPS): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error("Seconds must be a non-negative finite number.");
  }
  return Math.round(seconds * fps);
}

export function framesToTimecode(frames: number, fps = DEFAULT_FPS): string {
  if (!Number.isInteger(frames) || frames < 0) {
    throw new Error("Frames must be a non-negative integer.");
  }
  const ff = frames % fps;
  const totalSeconds = Math.floor(frames / fps);
  const ss = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mm = totalMinutes % 60;
  const hh = Math.floor(totalMinutes / 60);
  return [hh, mm, ss].map((part) => part.toString().padStart(2, "0")).join(":") + `:${ff.toString().padStart(2, "0")}`;
}

export function timecodeToFrames(timecode: string, fps = DEFAULT_FPS): number {
  const match = /^(\d{2}):(\d{2}):(\d{2}):(\d{2})$/.exec(timecode);
  if (!match) {
    throw new Error(`Invalid timecode: ${timecode}`);
  }
  const [, hh, mm, ss, ff] = match;
  const framePart = Number(ff);
  if (framePart >= fps) {
    throw new Error(`Frame part must be 00-${String(fps - 1).padStart(2, "0")}.`);
  }
  return (((Number(hh) * 60 + Number(mm)) * 60 + Number(ss)) * fps + framePart);
}

export function framesToMicroseconds(frames: number, fps = DEFAULT_FPS): number {
  return Math.round((frames / fps) * 1_000_000);
}

