import { CompareOutcome, CompareReport, NoComparableBaseline } from "./compare.js";

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function ms(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value / 1000).toFixed(1)}s`;
}

function formatReport(report: CompareReport): string {
  const { baseline, failed, changes } = report;
  const lines = [
    "RunReplay comparison",
    "",
    "Failed job:",
    `  run ${failed.runId}`,
    `  commit ${shortSha(failed.commitSha)}`,
    `  conclusion ${failed.conclusion ?? "—"}`,
    "",
    "Baseline:",
    `  run ${baseline.runId}`,
    `  commit ${shortSha(baseline.commitSha)}`,
    `  conclusion ${baseline.conclusion ?? "—"}`,
    "",
    "Changes detected:",
  ];
  if (changes.workflow.changed) {
    lines.push("", "  WORKFLOW", `  before: ${shortSha(changes.workflow.beforeSourceHash)}`, `  after:  ${shortSha(changes.workflow.afterSourceHash)}`);
  }
  if (changes.actionRevisions.length) {
    lines.push("", "  ACTION REVISIONS");
    for (const action of changes.actionRevisions) {
      lines.push(`  ${action.uses}`, `    before: ${action.before.executedSha ?? action.before.resolvedNowSha ?? action.before.declaredRef ?? "absent"}`, `    after:  ${action.after.executedSha ?? action.after.resolvedNowSha ?? action.after.declaredRef ?? "absent"}`, `    evidence: ${action.after.evidence}`);
    }
  }
  if (changes.runner.changed) {
    lines.push("", "  RUNNER", `  before: ${changes.runner.beforeLabels.join(", ") || "—"}`, `  after:  ${changes.runner.afterLabels.join(", ") || "—"}`);
  }
  if (changes.repository) {
    lines.push("", "  REPOSITORY", `  ${changes.repository.totalCommits} commits changed`);
    for (const file of changes.repository.files.slice(0, 10)) lines.push(`  ${file.status}: ${file.filename}`);
    if (changes.repository.truncated) lines.push("  Changed-file list truncated by GitHub.");
  }
  if (changes.steps.length) {
    lines.push("", "  STEPS");
    for (const step of changes.steps) lines.push(`  ${step.kind}: ${step.name} (${step.beforeConclusion ?? "—"} → ${step.afterConclusion ?? "—"})`);
  }
  if (changes.artifacts.length) {
    lines.push("", "  ARTIFACTS");
    for (const artifact of changes.artifacts) lines.push(`  ${artifact.kind}: ${artifact.name}`);
  }
  if (changes.timing.deltaMs !== null) lines.push("", "  TIMING", `  duration delta: ${ms(changes.timing.deltaMs)}`);
  if (!changes.workflow.changed && !changes.actionRevisions.length && !changes.runner.changed && !changes.repository && !changes.steps.length && !changes.artifacts.length) {
    lines.push("  No differences were available from the selected GitHub API evidence.");
  }
  lines.push("", "Changed inputs (not causal conclusions):", ...(report.changedInputs.length ? report.changedInputs.map((input, index) => `  ${index + 1}. ${input}`) : ["  None detected."]));
  if (report.limitations.length) lines.push("", "Limitations:", ...report.limitations.map((item) => `  - ${item}`));
  return lines.join("\n");
}

function formatNoBaseline(result: NoComparableBaseline): string {
  return [
    "RunReplay comparison",
    "",
    `Failed job: run ${result.failed.runId}, commit ${shortSha(result.failed.commitSha)}`,
    "Baseline: none",
    `Reason: ${result.reason}`,
    ...(result.searchedRuns === undefined ? [] : [`Successful runs searched: ${result.searchedRuns}`]),
    "",
    result.reason === "baseline-search-limit-reached"
      ? "RunReplay stopped at its documented search limit and did not guess a baseline."
      : "RunReplay did not guess a baseline. No earlier successful job exactly matched the workflow identity, job name, event, branch, and runner labels.",
  ].join("\n");
}

export function formatCompareOutcome(result: CompareOutcome): string {
  return result.baseline === null ? formatNoBaseline(result) : formatReport(result);
}
