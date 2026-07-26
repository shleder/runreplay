import { Inspection } from "./types.js";

export interface JsonInspection {
  schemaVersion: "1.0";
  repository: string;
  runId: number;
  jobId: number;
  commitSha: string;
  event: string;
  runner: {
    labels: string[];
  };
  steps: Array<{
    number: number;
    name: string;
    status: string;
    conclusion: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }>;
  artifacts: Array<{
    id: number;
    name: string;
    sizeInBytes: number;
    expired: boolean;
    archiveDownloadUrl: string;
  }>;
  logsApiUrl: string;
  redactions: string[];
}

/**
 * Convert API data into the documented, machine-readable RunReplay schema.
 * This function performs no secret discovery or redaction because GitHub does
 * not include job secrets in these endpoints; `redactions` remains explicit
 * so future exporters can report any values they remove.
 */
export function toJsonInspection(data: Inspection): JsonInspection {
  return {
    schemaVersion: "1.0",
    repository: `${data.reference.owner}/${data.reference.repo}`,
    runId: data.reference.runId,
    jobId: data.reference.jobId,
    commitSha: data.run.head_sha,
    event: data.run.event,
    runner: {
      labels: [...(data.job.runner_labels ?? data.job.labels ?? [])],
    },
    steps: data.job.steps.map((step) => ({
      number: step.number,
      name: step.name,
      status: step.status,
      conclusion: step.conclusion,
      startedAt: step.started_at,
      completedAt: step.completed_at,
    })),
    artifacts: data.artifacts.map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      sizeInBytes: artifact.size_in_bytes,
      expired: artifact.expired,
      archiveDownloadUrl: artifact.archive_download_url,
    })),
    logsApiUrl: data.logsApiUrl,
    redactions: [],
  };
}
