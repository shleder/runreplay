export interface JobReference {
  owner: string;
  repo: string;
  runId: number;
  jobId: number;
}

export interface GithubStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface GithubJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  run_id: number;
  run_url: string;
  head_sha: string;
  started_at: string | null;
  completed_at: string | null;
  runner_name: string | null;
  runner_group_name: string | null;
  /** Returned for some GitHub Actions job payloads. */
  runner_labels?: string[];
  /** Returned by the REST API for GitHub-hosted runner jobs. */
  labels?: string[];
  steps: GithubStep[];
}

export interface GithubWorkflowRun {
  id: number;
  name: string | null;
  display_title: string | null;
  event: string;
  status: string;
  conclusion: string | null;
  head_branch: string | null;
  head_sha: string;
  html_url: string;
  workflow_id: number;
  /** Workflow path returned as `.github/workflows/name.yml@ref` by GitHub. */
  path: string;
  created_at: string;
}

export interface GithubArtifactWorkflowRun {
  id: number;
  repository_id?: number;
  head_repository_id?: number;
  head_branch?: string | null;
  head_sha?: string | null;
}

export interface GithubArtifact {
  id: number;
  url?: string;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
  digest?: string | null;
  archive_download_url: string;
  workflow_run?: GithubArtifactWorkflowRun | null;
}

export interface Inspection {
  reference: JobReference;
  job: GithubJob;
  run: GithubWorkflowRun;
  artifacts: GithubArtifact[];
  logsApiUrl: string;
}

export type ResolutionEvidence =
  | "runtime-log"
  | "declared-full-sha"
  | "github-api-current-ref"
  | "unresolved";

export type ActionKind =
  | "repository"
  | "local"
  | "docker"
  | "reusable-workflow"
  | "dynamic"
  | "unknown";

export interface ResolvedAction {
  uses: string;
  kind: ActionKind;
  repository: string | null;
  declaredRef: string | null;
  declaredImmutable: boolean;
  executedSha: string | null;
  resolvedNowSha: string | null;
  evidence: ResolutionEvidence;
  reason?: string;
}

export interface ResolveManifest {
  schemaVersion: "1.1";
  workflow: {
    path: string;
    sourceCommitSha: string;
    evidence: "workflow-run-api";
  };
  actions: ResolvedAction[];
  limitations: string[];
}

/** The source and resolution evidence needed to compare two historical jobs. */
export interface ResolvedJobContext {
  inspection: Inspection;
  manifest: ResolveManifest;
  workflowSource: string;
}

export interface ChangedFile {
  filename: string;
  status: string;
}

export interface CommitComparison {
  totalCommits: number;
  files: ChangedFile[];
  truncated: boolean;
}
