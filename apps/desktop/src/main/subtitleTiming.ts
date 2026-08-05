export interface WordSubtitleCue {
  id: string;
  scriptSectionId: string;
  startFrame: number;
  durationFrames: number;
  text: string;
}

export function createWordLevelSubtitleCues(input: {
  sectionId: string;
  narration: string;
  startFrame: number;
  durationFrames: number;
}): WordSubtitleCue[] {
  const words = input.narration.trim().split(/\s+/).filter(Boolean);
  if (!words.length) throw new Error("Script section has no subtitle text.");
  if (!Number.isInteger(input.durationFrames) || input.durationFrames < words.length) {
    throw new Error("Subtitle timing cannot give every word a positive duration.");
  }

  const weights = words.map((word) => Math.max(1, Array.from(word).length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const remainingFrames = input.durationFrames - words.length;
  const durations = words.map(() => 1);
  const remainders = words.map((_, index) => {
    const exact = remainingFrames * weights[index]! / totalWeight;
    const whole = Math.floor(exact);
    durations[index] = durations[index]! + whole;
    return { index, remainder: exact - whole };
  });
  let unallocated = input.durationFrames - durations.reduce((sum, duration) => sum + duration, 0);
  remainders.sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remainders.length && unallocated > 0; index += 1) {
    const durationIndex = remainders[index]!.index;
    durations[durationIndex] = durations[durationIndex]! + 1;
    unallocated -= 1;
  }

  let offset = 0;
  return words.map((text, index) => {
    const cue = {
      id: `cue-${input.sectionId}-${index + 1}`,
      scriptSectionId: input.sectionId,
      startFrame: input.startFrame + offset,
      durationFrames: durations[index]!,
      text
    };
    offset += cue.durationFrames;
    return cue;
  });
}
