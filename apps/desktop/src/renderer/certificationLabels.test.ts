import { describe, expect, it } from "vitest";
import { certificationTone, imageCertificationLabel, textCertificationLabel } from "./certificationLabels";

describe("certification labels", () => {
  it("labels text certification states", () => {
    expect(textCertificationLabel("verified")).toBe("Verified");
    expect(textCertificationLabel("testing")).toBe("Testing");
    expect(textCertificationLabel("failed")).toBe("Failed");
    expect(textCertificationLabel("stale")).toBe("Stale");
  });

  it("labels image certification states", () => {
    expect(imageCertificationLabel("verified")).toBe("Verified");
    expect(imageCertificationLabel("failed")).toBe("Failed");
    expect(imageCertificationLabel("stale")).toBe("Stale");
    expect(imageCertificationLabel("not_tested")).toBe("Not Tested");
  });

  it("maps badge tones consistently", () => {
    expect(certificationTone("Verified")).toBe("success");
    expect(certificationTone("Failed")).toBe("danger");
    expect(certificationTone("Testing")).toBe("info");
    expect(certificationTone("Not Tested")).toBe("warning");
  });
});
