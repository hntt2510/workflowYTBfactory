import { describe, expect, it } from "vitest";
import {
  channelRouteInputSchema,
  createProjectRequestSchema,
  factoryProjectResponseSchema,
  projectIdRequestSchema
} from "../src";
import { createFixtureProject } from "../src";

describe("ipc schemas", () => {
  it("accepts valid project and route payloads", () => {
    const parsed = createProjectRequestSchema.parse({
      topic: "Bible topic",
      projectName: "Bible channel",
      targetDuration: "10-12 minutes",
      workflowMode: "semi_automatic"
    });
    expect(parsed.format).toBe("long");
    expect(parsed.projectName).toBe("Bible channel");
    expect(parsed.targetDuration).toBe("10-12 minutes");
    expect(parsed.workflowMode).toBe("semi_automatic");
    expect(channelRouteInputSchema.parse({ topic: "term life", format: "long", targetLanguage: "English" }).topic).toBe("term life");
  });

  it("rejects invalid project ids", () => {
    expect(() => projectIdRequestSchema.parse({ projectId: "../bad" })).toThrow();
  });

  it("validates fixture project responses", () => {
    const project = createFixtureProject({
      topic: "term life",
      format: "long",
      targetLanguage: "English",
      projectName: "Term Life Desk",
      targetDuration: "12-15 minutes"
    });
    expect(factoryProjectResponseSchema.parse(project).id).toBe(project.id);
  });
});
