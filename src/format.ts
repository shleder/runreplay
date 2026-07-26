import { artifactAvailability } from "./artifacts.js";
import { GithubArtifact, Inspection } from "./types.js";

function value(input: string | null | undefined): string {
  return input && input.trim() ? input : "—";
}

function shortSha(input: string | null | undefined): string {
  return input && input.length > 12 ? input.slice(0, 12) : value(input);
}

function workflowRunLabel(artifact: GithubArtifact): string | null {
  if (!artifact.workflow_run) return null;
  const parts = [`#${artifact.workflow_run.id}`];
  if (artifact.workflow_run.head_branch) parts.push(artifact.workflow_run.head_branch);
  if (artifact.workflow_run.head_sha) parts.push(`@ ${shortSha(artifact.workflow_run.head_sha)}`);
  return parts.join(" ");
}

function formatArtifact(artifact: GithubArtifact): string {
  const lines = [
    `  - ${artifact.name} (${artifact.size_in_bytes} bytes; ${artifactAvailability(artifact)})`,
  ];
  if (artifact.created_at) lines.push(`    Created: ${artifact.created_at}`);
  if (artifact.expires_at) lines.push(`    Expires: ${artifact.expires_at}`);
  const workflowRun = workflowRunLabel(artifact);
  if (workflowRun) lines.push(`    Workflow run: ${workflowRun}`);
  if (artifact.digest) lines.push(`    Digest: ${artifact.digest}`);
  lines.push(`    Download: ${artifact.archive_download_url}`);
  return lines.join("\n");
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
      ? data.artifacts.map(formatArtifact)
      : ["  No artifacts attached to this workflow run."]),
  ];
  return lines.join("\n");
}
