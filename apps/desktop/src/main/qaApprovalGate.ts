export interface QaApprovalFinding {
  severity: "blocking" | "warning";
}

export function qaFindingsBlockApproval(findings: readonly QaApprovalFinding[]): boolean {
  return findings.some((finding) => finding.severity === "blocking");
}
