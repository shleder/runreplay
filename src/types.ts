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
}

export interface GithubArtifact {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  archive_download_url: string;
}

export interface Inspection {
  reference: JobReference;
  job: GithubJob;
  run: GithubWorkflowRun;
  artifacts: GithubArtifact[];
  logsApiUrl: string;
}
