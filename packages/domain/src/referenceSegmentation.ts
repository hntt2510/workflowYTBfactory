import { referenceSegmentationOutputSchema, type ReferenceSegmentationOutput } from "./ipcSchemas";

export interface ReferenceSegmentationValidation {
  output?: ReferenceSegmentationOutput;
  errors: string[];
}

export function validateReferenceSegmentationOutput(payload: unknown, cleanedTranscript: string, referenceId: string): ReferenceSegmentationValidation {
  const parsed = referenceSegmentationOutputSchema.safeParse(payload);
  if (!parsed.success) return { errors: ["Segmentation output does not match the required schema."] };
  const errors: string[] = [];
  if (parsed.data.referenceId !== referenceId) errors.push("Segmentation output reference does not match the approved transcript.");
  let previousEnd = 0;
  for (let index = 0; index < parsed.data.segments.length; index += 1) {
    const segment = parsed.data.segments[index]!;
    if (segment.order !== index) errors.push(`Segment ${segment.id} has an unstable order.`);
    if (segment.startCharacter >= segment.endCharacter || segment.endCharacter > cleanedTranscript.length) errors.push(`Segment ${segment.id} has an invalid character range.`);
    if (segment.startCharacter < previousEnd) errors.push(`Segment ${segment.id} overlaps the previous segment.`);
    if (cleanedTranscript.slice(segment.startCharacter, segment.endCharacter) !== segment.text) errors.push(`Segment ${segment.id} text does not match the cleaned transcript.`);
    previousEnd = segment.endCharacter;
  }
  return errors.length ? { errors } : { output: parsed.data, errors: [] };
}
