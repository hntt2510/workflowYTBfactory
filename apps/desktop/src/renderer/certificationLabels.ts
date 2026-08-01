import type { ImageModelCertificationResponse, TextModelCertificationStatus } from "./types";

export function textCertificationLabel(status: TextModelCertificationStatus): string {
  if (status === "verified") return "Verified";
  if (status === "failed") return "Failed";
  if (status === "stale") return "Stale";
  if (status === "testing") return "Testing";
  return "Not Verified";
}

export function imageCertificationLabel(status: ImageModelCertificationResponse["status"]): string {
  if (status === "verified") return "Verified";
  if (status === "failed") return "Failed";
  if (status === "stale") return "Stale";
  return "Not Tested";
}

export function certificationTone(status: string): "default" | "success" | "warning" | "danger" | "info" {
  if (status === "Verified") return "success";
  if (status === "Failed") return "danger";
  if (status === "Testing") return "info";
  return "warning";
}
