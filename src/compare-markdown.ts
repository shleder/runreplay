import { CompareOutcome, CompareReport, NoComparableBaseline } from "./compare.js";

function code(value: string | number | null): string {
  const text = value === null ? "—" : String(value);
  const longestRun = Math.max(0, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length));
  const fence = "`".repeat(longestRun + 1);
  const padding = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${padding}${text}${padding}${fence}`;
}

function shortSha(value: string): string {
  return value.slice(0, 12);
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function duration(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value / 1000).toFixed(1)}s`;
}

function jobSection(title: string, job: CompareReport["failed"]): string[] {
  return [
    `### ${title}`,
    "",
    `- Repository: ${code(job.repository)}`,
    `- Workflow: ${code(job.workflowPath)}`,
    `- Job: ${code(job.jobName)}`,
    `- Run: ${code(job.runId)}`,
    `- Job ID: ${code(job.jobId)}`,
    `- Commit: ${code(shortSha(job.commitSha))}`,
    `- Conclusion: ${code(job.conclusion)}`,
    `- Event: ${code(job.event)}`,
    `- Branch: ${code(job.branch)}`,
  ];
}

function reportMarkdown(report: CompareReport): string {
  const { changes } = report;
  const lines = [
    "## RunReplay comparison",
    "",
    ...jobSection("Failed job", report.failed),
    "",
    ...jobSection("Baseline", report.baseline),
    "",
    "### Identity",
    "",
    `- Same repository: **${yesNo(report.identity.sameRepository)}**`,
    `- Same workflow path: **${yesNo(report.identity.sameWorkflowPath)}**`,
    `- Same job name: **${yesNo(report.identity.sameJobName)}**`,
    `- Same event: **${yesNo(report.identity.sameEvent)}**`,
    `- Same branch: **${yesNo(report.identity.sameBranch)}**`,
    "",
    "### Changes detected",
  ];

  let changed = false;
  if (changes.workflow.changed) {
    changed = true;
    lines.push(
      "",
      "#### Workflow",
      "",
      `- Before source hash: ${code(shortSha(changes.workflow.beforeSourceHash))}`,
      `- After source hash: ${code(shortSha(changes.workflow.afterSourceHash))}`,
    );
  }

  if (changes.actionRevisions.length) {
    changed = true;
    lines.push("", "#### Action revisions", "");
    for (const action of changes.actionRevisions) {
      lines.push(
        `- ${code(action.uses)}`,
        `  - Before: ${code(action.before.executedSha ?? action.before.resolvedNowSha ?? action.before.declaredRef ?? "absent")}`,
        `  - After: ${code(action.after.executedSha ?? action.after.resolvedNowSha ?? action.after.declaredRef ?? "absent")}`,
        `  - Evidence: ${code(action.after.evidence)}`,
      );
    }
  }

  if (changes.runner.changed) {
    changed = true;
    lines.push(
      "",
      "#### Runner",
      "",
      `- Before labels: ${changes.runner.beforeLabels.length ? changes.runner.beforeLabels.map(code).join(", ") : "—"}`,
      `- After labels: ${changes.runner.afterLabels.length ? changes.runner.afterLabels.map(code).join(", ") : "—"}`,
    );
  }

  if (changes.repository) {
    changed = true;
    lines.push(
      "",
      "#### Repository",
      "",
      `- Commits changed: ${code(changes.repository.totalCommits)}`,
    );
    for (const file of changes.repository.files) {
      lines.push(`- ${code(file.status)}: ${code(file.filename)}`);
    }
    if (changes.repository.truncated) {
      lines.push("- GitHub returned a truncated changed-file list.");
    }
  }

  if (changes.steps.length) {
    changed = true;
    lines.push("", "#### Steps", "");
    for (const step of changes.steps) {
      lines.push(
        `- ${code(step.kind)} ${code(step.name)}: ${code(step.beforeConclusion)} → ${code(step.afterConclusion)}`,
      );
    }
  }

  if (changes.artifacts.length) {
    changed = true;
    lines.push("", "#### Artifacts", "");
    for (const artifact of changes.artifacts) {
      lines.push(
        `- ${code(artifact.kind)} ${code(artifact.name)}: ${code(artifact.beforeSizeInBytes)} → ${code(artifact.afterSizeInBytes)} bytes`,
      );
    }
  }

  if (changes.timing.deltaMs !== null) {
    changed = true;
    lines.push("", "#### Timing", "", `- Duration delta: ${code(duration(changes.timing.deltaMs))}`);
  }

  if (!changed) {
    lines.push("", "No differences were available from the selected GitHub API evidence.");
  }

  lines.push(
    "",
    "### Changed inputs",
    "",
    "> These are factual changed inputs, not causal conclusions.",
    "",
    ...(report.changedInputs.length ? report.changedInputs.map((item) => `- ${item}`) : ["- None detected."]),
    "",
    "### Limitations",
    "",
    ...(report.limitations.length ? report.limitations.map((item) => `- ${item}`) : ["- No additional limitations were reported."]),
  );

  return lines.join("\n");
}

function noBaselineMarkdown(result: NoComparableBaseline): string {
  const explanation = result.reason === "baseline-search-limit-reached"
    ? "RunReplay stopped at its documented search limit and did not guess a baseline."
    : "RunReplay did not guess a baseline because no earlier successful job exactly matched the workflow identity, job name, event, branch, and runner labels.";

  return [
    "## RunReplay comparison",
    "",
    ...jobSection("Failed job", result.failed),
    "",
    "### Baseline",
    "",
    "- Baseline: **none**",
    `- Reason: ${code(result.reason)}`,
    ...(result.searchedRuns === undefined ? [] : [`- Successful runs searched: ${code(result.searchedRuns)}`]),
    "",
    `> ${explanation}`,
  ].join("\n");
}

export function formatCompareOutcomeMarkdown(result: CompareOutcome): string {
  return result.baseline === null ? noBaselineMarkdown(result) : reportMarkdown(result);
}
