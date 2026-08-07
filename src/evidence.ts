import { createHash } from "node:crypto";
import type { CompareOutcome, CompareReport } from "./compare.js";
import { toJsonInspection, type JsonInspection } from "./json.js";
import type { ResolvedJobContext, ResolveManifest } from "./types.js";

export interface CiEvidenceSummary {
  repository: string;
  runId: number;
  jobId: number;
  commitSha: string;
  workflowPath: string;
  jobName: string;
  runnerLabels: string[];
  failedSteps: string[];
  changedFiles: string[];
  changedInputs: string[];
  baselineAvailable: boolean;
  fingerprint: string;
}

export interface CiEvidenceBundle {
  schemaVersion: "1.0";
  inspection: JsonInspection;
  resolution: ResolveManifest;
  comparison: CompareOutcome;
  summary: CiEvidenceSummary;
  limitations: string[];
}

function compareReport(value: CompareOutcome): value is CompareReport {
  return value.baseline !== null;
}

function failedSteps(inspection: JsonInspection): string[] {
  return inspection.steps
    .filter((step) => step.conclusion === "failure" || step.conclusion === "timed_out")
    .map((step) => step.name);
}

function changedFiles(comparison: CompareOutcome): string[] {
  if (!compareReport(comparison)) return [];
  return [...new Set((comparison.changes.repository?.files ?? []).map((file) => file.filename))].sort();
}

function changedInputs(comparison: CompareOutcome): string[] {
  return compareReport(comparison) ? [...comparison.changedInputs] : [];
}

function limitations(context: ResolvedJobContext, comparison: CompareOutcome): string[] {
  const values = [...context.manifest.limitations];
  if (compareReport(comparison)) values.push(...comparison.limitations);
  else values.push(
    comparison.reason === "baseline-search-limit-reached"
      ? "No comparable successful baseline was found before the bounded workflow-run search limit was reached."
      : "No comparable successful baseline was found."
  );
  return [...new Set(values)];
}

function fingerprint(input: {
  inspection: JsonInspection;
  context: ResolvedJobContext;
  comparison: CompareOutcome;
  failedSteps: string[];
  changedFiles: string[];
  changedInputs: string[];
}): string {
  const baselineCommitSha = input.comparison.baseline?.commitSha ?? null;
  const canonical = JSON.stringify({
    repository: input.inspection.repository,
    runId: input.inspection.runId,
    jobId: input.inspection.jobId,
    commitSha: input.inspection.commitSha,
    workflowPath: input.context.manifest.workflow.path,
    jobName: input.context.inspection.job.name,
    runnerLabels: [...input.inspection.runner.labels].sort(),
    failedSteps: [...input.failedSteps].sort(),
    changedFiles: input.changedFiles,
    changedInputs: input.changedInputs,
    baselineCommitSha
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Build the stable machine-consumable evidence packet used by downstream
 * systems such as OSS Swarm. It reports observable differences and explicit
 * limitations; it does not claim a causal explanation for the CI failure.
 */
export function buildCiEvidenceBundle(
  context: ResolvedJobContext,
  comparison: CompareOutcome
): CiEvidenceBundle {
  const inspection = toJsonInspection(context.inspection);
  const failed = failedSteps(inspection);
  const files = changedFiles(comparison);
  const inputs = changedInputs(comparison);

  return {
    schemaVersion: "1.0",
    inspection,
    resolution: context.manifest,
    comparison,
    summary: {
      repository: inspection.repository,
      runId: inspection.runId,
      jobId: inspection.jobId,
      commitSha: inspection.commitSha,
      workflowPath: context.manifest.workflow.path,
      jobName: context.inspection.job.name,
      runnerLabels: [...inspection.runner.labels],
      failedSteps: failed,
      changedFiles: files,
      changedInputs: inputs,
      baselineAvailable: comparison.baseline !== null,
      fingerprint: fingerprint({
        inspection,
        context,
        comparison,
        failedSteps: failed,
        changedFiles: files,
        changedInputs: inputs
      })
    },
    limitations: limitations(context, comparison)
  };
}
