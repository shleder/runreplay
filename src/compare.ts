import { createHash } from "node:crypto";
import { ChangedFile, CommitComparison, GithubJob, GithubWorkflowRun, ResolvedAction, ResolvedJobContext } from "./types.js";

export interface ComparisonJob {
  repository: string;
  runId: number;
  jobId: number;
  commitSha: string;
  conclusion: string | null;
  workflowPath: string;
  event: string;
  branch: string | null;
  jobName: string;
}

export interface ActionRevisionChange {
  uses: string;
  before: ActionRevision;
  after: ActionRevision;
}

export interface ActionRevision {
  declaredRef: string | null;
  executedSha: string | null;
  resolvedNowSha: string | null;
  evidence: string;
}

export interface StepChange {
  name: string;
  kind: "added" | "removed" | "changed";
  beforeConclusion: string | null;
  afterConclusion: string | null;
}

export interface ArtifactChange {
  name: string;
  kind: "added" | "removed" | "changed";
  beforeSizeInBytes: number | null;
  afterSizeInBytes: number | null;
}

export interface CompareReport {
  schemaVersion: "1.0";
  baseline: ComparisonJob;
  failed: ComparisonJob;
  identity: {
    sameRepository: boolean;
    sameWorkflowPath: boolean;
    sameJobName: boolean;
    sameEvent: boolean;
    sameBranch: boolean;
  };
  changes: {
    workflow: {
      beforeSourceHash: string;
      afterSourceHash: string;
      changed: boolean;
    };
    actionRevisions: ActionRevisionChange[];
    runner: {
      beforeLabels: string[];
      afterLabels: string[];
      changed: boolean;
    };
    steps: StepChange[];
    artifacts: ArtifactChange[];
    timing: {
      beforeDurationMs: number | null;
      afterDurationMs: number | null;
      deltaMs: number | null;
    };
    repository: CommitComparison | null;
  };
  /** Factual changed inputs, not causal explanations for the failure. */
  changedInputs: string[];
  limitations: string[];
}

export interface NoComparableBaseline {
  schemaVersion: "1.0";
  failed: ComparisonJob;
  baseline: null;
  reason: "no-comparable-successful-job" | "baseline-search-limit-reached";
  /** Present only when RunReplay stopped at its documented workflow-run limit. */
  searchedRuns?: number;
}

export type CompareOutcome = CompareReport | NoComparableBaseline;

export function toComparisonJob(context: ResolvedJobContext): ComparisonJob {
  const { inspection, manifest } = context;
  return {
    repository: `${inspection.reference.owner}/${inspection.reference.repo}`,
    runId: inspection.reference.runId,
    jobId: inspection.reference.jobId,
    commitSha: inspection.run.head_sha,
    conclusion: inspection.job.conclusion,
    workflowPath: manifest.workflow.path,
    event: inspection.run.event,
    branch: inspection.run.head_branch,
    jobName: inspection.job.name,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function labels(job: GithubJob): string[] {
  return [...(job.runner_labels ?? job.labels ?? [])].sort();
}

function sameValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function actionRevision(action: ResolvedAction): ActionRevision {
  return {
    declaredRef: action.declaredRef,
    executedSha: action.executedSha,
    resolvedNowSha: action.resolvedNowSha,
    evidence: action.evidence,
  };
}

function equalActionRevision(left: ActionRevision, right: ActionRevision): boolean {
  return left.declaredRef === right.declaredRef
    && left.executedSha === right.executedSha
    && left.resolvedNowSha === right.resolvedNowSha
    && left.evidence === right.evidence;
}

function compareActions(before: ResolvedAction[], after: ResolvedAction[]): ActionRevisionChange[] {
  const beforeByUses = new Map(before.map((action) => [action.uses, action]));
  const afterByUses = new Map(after.map((action) => [action.uses, action]));
  return [...new Set([...beforeByUses.keys(), ...afterByUses.keys()])]
    .sort()
    .flatMap((uses) => {
      const left = beforeByUses.get(uses);
      const right = afterByUses.get(uses);
      const beforeRevision = left ? actionRevision(left) : { declaredRef: null, executedSha: null, resolvedNowSha: null, evidence: "absent" };
      const afterRevision = right ? actionRevision(right) : { declaredRef: null, executedSha: null, resolvedNowSha: null, evidence: "absent" };
      return equalActionRevision(beforeRevision, afterRevision) ? [] : [{ uses, before: beforeRevision, after: afterRevision }];
    });
}

function compareSteps(before: GithubJob, after: GithubJob): StepChange[] {
  const beforeByName = new Map(before.steps.map((step) => [step.name, step]));
  const afterByName = new Map(after.steps.map((step) => [step.name, step]));
  const changes: StepChange[] = [];
  for (const name of new Set([...beforeByName.keys(), ...afterByName.keys()])) {
    const left = beforeByName.get(name);
    const right = afterByName.get(name);
    if (!left) changes.push({ name, kind: "added", beforeConclusion: null, afterConclusion: right?.conclusion ?? null });
    else if (!right) changes.push({ name, kind: "removed", beforeConclusion: left.conclusion, afterConclusion: null });
    else if (left.conclusion !== right.conclusion || left.status !== right.status) changes.push({ name, kind: "changed", beforeConclusion: left.conclusion, afterConclusion: right.conclusion });
  }
  return changes;
}

function compareArtifacts(before: ResolvedJobContext, after: ResolvedJobContext): ArtifactChange[] {
  const beforeByName = new Map(before.inspection.artifacts.map((artifact) => [artifact.name, artifact]));
  const afterByName = new Map(after.inspection.artifacts.map((artifact) => [artifact.name, artifact]));
  const changes: ArtifactChange[] = [];
  for (const name of [...new Set([...beforeByName.keys(), ...afterByName.keys()])].sort()) {
    const left = beforeByName.get(name);
    const right = afterByName.get(name);
    if (!left) changes.push({ name, kind: "added", beforeSizeInBytes: null, afterSizeInBytes: right?.size_in_bytes ?? null });
    else if (!right) changes.push({ name, kind: "removed", beforeSizeInBytes: left.size_in_bytes, afterSizeInBytes: null });
    else if (left.size_in_bytes !== right.size_in_bytes || left.expired !== right.expired) changes.push({ name, kind: "changed", beforeSizeInBytes: left.size_in_bytes, afterSizeInBytes: right.size_in_bytes });
  }
  return changes;
}

function duration(job: GithubJob): number | null {
  if (!job.started_at || !job.completed_at) return null;
  const start = Date.parse(job.started_at);
  const end = Date.parse(job.completed_at);
  return Number.isNaN(start) || Number.isNaN(end) ? null : end - start;
}

function sameBranch(before: GithubWorkflowRun, after: GithubWorkflowRun): boolean {
  return before.head_branch === after.head_branch;
}

/** Compare two fully resolved historical jobs. `before` is the successful baseline. */
export function compareResolvedJobs(
  before: ResolvedJobContext,
  after: ResolvedJobContext,
  repository: CommitComparison | null,
): CompareReport {
  const baseline = toComparisonJob(before);
  const failed = toComparisonJob(after);
  const beforeLabels = labels(before.inspection.job);
  const afterLabels = labels(after.inspection.job);
  const actionRevisions = compareActions(before.manifest.actions, after.manifest.actions);
  const workflowChanged = sha256(before.workflowSource) !== sha256(after.workflowSource);
  const runnerChanged = !sameValues(beforeLabels, afterLabels);
  const stepChanges = compareSteps(before.inspection.job, after.inspection.job);
  const artifactChanges = compareArtifacts(before, after);
  const beforeDurationMs = duration(before.inspection.job);
  const afterDurationMs = duration(after.inspection.job);
  const changedInputs: string[] = [];
  if (workflowChanged) changedInputs.push("Workflow source changed.");
  if (actionRevisions.length) changedInputs.push(`${actionRevisions.length} Action declaration or revision changed.`);
  if (runnerChanged) changedInputs.push("Runner labels changed.");
  if (repository && (repository.totalCommits > 0 || repository.files.length > 0)) {
    changedInputs.push(`${repository.totalCommits} repository commit(s) and ${repository.files.length} reported file(s) changed.`);
  }

  return {
    schemaVersion: "1.0",
    baseline,
    failed,
    identity: {
      sameRepository: baseline.repository === failed.repository,
      sameWorkflowPath: baseline.workflowPath === failed.workflowPath,
      sameJobName: baseline.jobName === failed.jobName,
      sameEvent: baseline.event === failed.event,
      sameBranch: sameBranch(before.inspection.run, after.inspection.run),
    },
    changes: {
      workflow: {
        beforeSourceHash: sha256(before.workflowSource),
        afterSourceHash: sha256(after.workflowSource),
        changed: workflowChanged,
      },
      actionRevisions,
      runner: { beforeLabels, afterLabels, changed: runnerChanged },
      steps: stepChanges,
      artifacts: artifactChanges,
      timing: {
        beforeDurationMs,
        afterDurationMs,
        deltaMs: beforeDurationMs === null || afterDurationMs === null ? null : afterDurationMs - beforeDurationMs,
      },
      repository,
    },
    changedInputs,
    limitations: [
      ...before.manifest.limitations.map((item) => `Baseline: ${item}`),
      ...after.manifest.limitations.map((item) => `Failed job: ${item}`),
      ...(repository?.truncated ? ["GitHub returned a partial changed-file list for this commit comparison."] : []),
    ],
  };
}

function sameLabels(left: GithubJob, right: GithubJob): boolean {
  return sameValues(labels(left), labels(right));
}

/** Strict matching predicate used before choosing an automatic successful baseline. */
export function isComparableSuccessfulJob(
  failedRun: GithubWorkflowRun,
  failedJob: GithubJob,
  candidateRun: GithubWorkflowRun,
  candidateJob: GithubJob,
): boolean {
  return candidateRun.conclusion === "success"
    && candidateJob.conclusion === "success"
    && failedRun.event === candidateRun.event
    && failedRun.head_branch === candidateRun.head_branch
    && failedJob.name === candidateJob.name
    && sameLabels(failedJob, candidateJob);
}

export function compactChangedFiles(files: Array<{ filename: string; status: string }>, totalCommits: number, truncated: boolean): CommitComparison {
  return { totalCommits, files: files.map((file) => ({ filename: file.filename, status: file.status } satisfies ChangedFile)), truncated };
}
