import { Inspection } from "./types.js";

function value(input: string | null | undefined): string {
  return input && input.trim() ? input : "—";
}

export function formatInspection(data: Inspection): string {
  const runnerLabels = data.job.runner_labels ?? data.job.labels ?? [];
  const lines = [
    "RunReplay inspection",
    "",
    `Repository:       ${data.reference.owner}/${data.reference.repo}`,
    `Workflow run:     ${data.run.name ?? "unnamed"} (#${data.run.id})`,
    `Job:              ${data.job.name} (#${data.job.id})`,
    `Conclusion:       ${value(data.job.conclusion)} (${data.job.status})`,
    `Commit SHA:       ${data.run.head_sha}`,
    `Branch:           ${value(data.run.head_branch)}`,
    `Event:            ${data.run.event}`,
    `Runner labels:    ${runnerLabels.length ? runnerLabels.join(", ") : "—"}`,
    `Runner name:      ${value(data.job.runner_name)}`,
    `Started:          ${value(data.job.started_at)}`,
    `Completed:        ${value(data.job.completed_at)}`,
    `Job URL:          ${data.job.html_url}`,
    `Logs API URL:     ${data.logsApiUrl}`,
    "",
    "Steps:",
    ...(data.job.steps.length
      ? data.job.steps.map((step) => `  ${step.number}. [${value(step.conclusion)}] ${step.name}`)
      : ["  No step data returned by GitHub."]),
    "",
    `Artifacts (${data.artifacts.length}):`,
    ...(data.artifacts.length
      ? data.artifacts.map((artifact) => `  - ${artifact.name} (${artifact.size_in_bytes} bytes; ${artifact.expired ? "expired" : "available"})\n    ${artifact.archive_download_url}`)
      : ["  No artifacts attached to this workflow run."]),
  ];
  return lines.join("\n");
}
