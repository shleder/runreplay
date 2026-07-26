import { ResolveManifest } from "./types.js";

export function formatResolveManifest(manifest: ResolveManifest): string {
  const lines = [
    "RunReplay resolve manifest",
    "",
    `Workflow:          ${manifest.workflow.path}`,
    `Source commit:     ${manifest.workflow.sourceCommitSha}`,
    `Schema version:    ${manifest.schemaVersion}`,
    "",
    "Actions:",
    ...(manifest.actions.length
      ? manifest.actions.map((action) => {
        const sha = action.executedSha ?? action.resolvedNowSha ?? "—";
        const label = action.executedSha ? "executed SHA" : action.resolvedNowSha ? "resolved now" : action.reason ?? "unresolved";
        return `  - [${action.evidence}] ${action.uses}\n    ${label}: ${sha}`;
      })
      : ["  No supported action declarations found."]),
    "",
    "Limitations:",
    ...(manifest.limitations.length ? manifest.limitations.map((item) => `  - ${item}`) : ["  None reported."]),
  ];
  return lines.join("\n");
}
