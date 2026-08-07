import { resolveManifest, workflowPathFromRun } from "./resolve.js";
import { compareResolvedJobs, CompareOutcome, isComparableSuccessfulJob, NoComparableBaseline, toComparisonJob } from "./compare.js";
import { buildCiEvidenceBundle, type CiEvidenceBundle } from "./evidence.js";
import { CommitComparison, GithubArtifact, GithubJob, GithubWorkflowRun, Inspection, JobReference, ResolvedJobContext, ResolveManifest } from "./types.js";

export class GithubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GithubApiError";
  }
}

export class GithubClient {
  private static readonly BASELINE_RUN_SEARCH_LIMIT = 1_000;
  private static readonly PAGE_SIZE = 100;
  constructor(
    private readonly token?: string,
    private readonly apiBase = "https://api.github.com",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async inspect(reference: JobReference): Promise<Inspection> {
    const prefix = `/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(reference.repo)}`;
    const [job, run, artifactResponse] = await Promise.all([
      this.get<GithubJob>(`${prefix}/actions/jobs/${reference.jobId}`),
      this.get<GithubWorkflowRun>(`${prefix}/actions/runs/${reference.runId}`),
      this.get<{ artifacts: GithubArtifact[] }>(`${prefix}/actions/runs/${reference.runId}/artifacts`),
    ]);

    if (job.run_id !== reference.runId) {
      throw new Error("The job URL's run ID does not match the job returned by GitHub.");
    }

    return {
      reference,
      job,
      run,
      artifacts: artifactResponse.artifacts,
      logsApiUrl: `${this.apiBase}${prefix}/actions/jobs/${reference.jobId}/logs`,
    };
  }

  async resolve(reference: JobReference): Promise<ResolveManifest> {
    return (await this.resolveContext(reference)).manifest;
  }

  async resolveContext(reference: JobReference): Promise<ResolvedJobContext> {
    const inspection = await this.inspect(reference);
    const prefix = `/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(reference.repo)}`;
    const workflowPath = workflowPathFromRun(inspection.run.path);
    const workflowSource = await this.getContent(`${prefix}/contents/${workflowPath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(inspection.run.head_sha)}`);

    let runtimeLogs: string | null = null;
    let runtimeLogsUnavailableReason: string | undefined;
    try {
      runtimeLogs = await this.getText(`${prefix}/actions/jobs/${reference.jobId}/logs`);
    } catch (error) {
      runtimeLogsUnavailableReason = error instanceof GithubApiError ? `GitHub API ${error.status}` : "unknown download error";
    }

    const manifest = await resolveManifest(
      { inspection, workflowSource, runtimeLogs, runtimeLogsUnavailableReason },
      {
        resolveCurrentRef: (repository, ref) => this.getCommitSha(reference.owner, reference.repo, repository, ref),
        verifyDeclaredSha: (repository, sha) => this.getCommitSha(reference.owner, reference.repo, repository, sha),
      },
    );
    return { inspection, workflowSource, manifest };
  }

  async compare(failedReference: JobReference, baselineReference: JobReference): Promise<CompareOutcome> {
    const [failed, baseline] = await Promise.all([
      this.resolveContext(failedReference),
      this.resolveContext(baselineReference),
    ]);
    const repository = await this.compareCommitFiles(baseline, failed);
    return compareResolvedJobs(baseline, failed, repository);
  }

  async compareWithLastSuccessful(failedReference: JobReference): Promise<CompareOutcome> {
    return this.compareResolvedWithLastSuccessful(await this.resolveContext(failedReference));
  }

  /**
   * Collect one bounded, machine-readable evidence bundle without resolving the
   * failed job twice. This is the integration surface intended for automated
   * consumers; the result remains factual evidence rather than causal analysis.
   */
  async evidence(failedReference: JobReference): Promise<CiEvidenceBundle> {
    const failed = await this.resolveContext(failedReference);
    const comparison = await this.compareResolvedWithLastSuccessful(failed);
    return buildCiEvidenceBundle(failed, comparison);
  }

  async findLastSuccessfulReference(failed: Inspection): Promise<{ reference: JobReference | null; searchedRuns: number; limitReached: boolean }> {
    const prefix = `/repos/${encodeURIComponent(failed.reference.owner)}/${encodeURIComponent(failed.reference.repo)}`;
    const successfulRuns = await this.listSuccessfulWorkflowRuns(prefix, failed.run.workflow_id);
    const failedCreatedAt = Date.parse(failed.run.created_at);
    const candidates = successfulRuns.runs
      .filter((run) => run.id !== failed.run.id && (!Number.isFinite(failedCreatedAt) || Date.parse(run.created_at) < failedCreatedAt))
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));

    for (const run of candidates) {
      const jobs = await this.listJobsForRun(prefix, run.id);
      const job = jobs.find((item) => isComparableSuccessfulJob(failed.run, failed.job, run, item));
      if (job) {
        return {
          reference: { owner: failed.reference.owner, repo: failed.reference.repo, runId: run.id, jobId: job.id },
          searchedRuns: successfulRuns.runs.length,
          limitReached: false,
        };
      }
    }
    return { reference: null, searchedRuns: successfulRuns.runs.length, limitReached: successfulRuns.limitReached };
  }

  private async compareResolvedWithLastSuccessful(failed: ResolvedJobContext): Promise<CompareOutcome> {
    const baselineSearch = await this.findLastSuccessfulReference(failed.inspection);
    if (!baselineSearch.reference) {
      const noBaseline: NoComparableBaseline = {
        schemaVersion: "1.0",
        failed: toComparisonJob(failed),
        baseline: null,
        reason: baselineSearch.limitReached ? "baseline-search-limit-reached" : "no-comparable-successful-job",
        ...(baselineSearch.limitReached ? { searchedRuns: baselineSearch.searchedRuns } : {}),
      };
      return noBaseline;
    }
    const baseline = await this.resolveContext(baselineSearch.reference);
    const repository = await this.compareCommitFiles(baseline, failed);
    return compareResolvedJobs(baseline, failed, repository);
  }

  private async listSuccessfulWorkflowRuns(prefix: string, workflowId: number): Promise<{ runs: GithubWorkflowRun[]; limitReached: boolean }> {
    const runs: GithubWorkflowRun[] = [];
    for (let page = 1; runs.length < GithubClient.BASELINE_RUN_SEARCH_LIMIT; page += 1) {
      const query = new URLSearchParams({ status: "success", per_page: String(GithubClient.PAGE_SIZE), page: String(page) });
      const response = await this.get<{ workflow_runs: GithubWorkflowRun[] }>(`${prefix}/actions/workflows/${workflowId}/runs?${query}`);
      runs.push(...response.workflow_runs.slice(0, GithubClient.BASELINE_RUN_SEARCH_LIMIT - runs.length));
      if (response.workflow_runs.length < GithubClient.PAGE_SIZE) return { runs, limitReached: false };
    }
    return { runs, limitReached: true };
  }

  private async compareCommitFiles(baseline: ResolvedJobContext, failed: ResolvedJobContext): Promise<CommitComparison | null> {
    const baselineRepository = `${baseline.inspection.reference.owner}/${baseline.inspection.reference.repo}`;
    const failedRepository = `${failed.inspection.reference.owner}/${failed.inspection.reference.repo}`;
    if (baselineRepository !== failedRepository) return null;
    const prefix = `/repos/${encodeURIComponent(failed.inspection.reference.owner)}/${encodeURIComponent(failed.inspection.reference.repo)}`;
    try {
      const comparison = await this.get<{ total_commits: number; files?: Array<{ filename: string; status: string }> }>(
        `${prefix}/compare/${encodeURIComponent(baseline.inspection.run.head_sha)}...${encodeURIComponent(failed.inspection.run.head_sha)}`,
      );
      const files = (comparison.files ?? []).map((file) => ({ filename: file.filename, status: file.status }));
      return { totalCommits: comparison.total_commits, files, truncated: comparison.files === undefined || files.length >= 300 };
    } catch (error) {
      if (error instanceof GithubApiError && [404, 409, 422].includes(error.status)) return null;
      throw error;
    }
  }

  private async listJobsForRun(prefix: string, runId: number): Promise<GithubJob[]> {
    const jobs: GithubJob[] = [];
    for (let page = 1; ; page += 1) {
      const query = new URLSearchParams({ per_page: String(GithubClient.PAGE_SIZE), page: String(page) });
      const response = await this.get<{ jobs: GithubJob[] }>(`${prefix}/actions/runs/${runId}/jobs?${query}`);
      jobs.push(...response.jobs);
      if (response.jobs.length < GithubClient.PAGE_SIZE) return jobs;
    }
  }

  private async getCommitSha(owner: string, repo: string, repository: string, ref: string): Promise<string> {
    const [actionOwner, actionRepo] = repository.split("/");
    const targetOwner = actionOwner || owner;
    const targetRepo = actionRepo || repo;
    const commit = await this.get<{ sha: string }>(`/repos/${encodeURIComponent(targetOwner)}/${encodeURIComponent(targetRepo)}/commits/${encodeURIComponent(ref)}`);
    return commit.sha;
  }

  private async getContent(path: string): Promise<string> {
    const content = await this.get<{ type: string; encoding: string; content: string }>(path);
    if (content.type !== "file" || content.encoding !== "base64") {
      throw new Error("GitHub did not return a base64-encoded workflow file.");
    }
    return Buffer.from(content.content.replace(/\n/g, ""), "base64").toString("utf8");
  }

  private async getText(path: string): Promise<string> {
    const response = await this.request(path);
    return response.text();
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.request(path);
    return response.json() as Promise<T>;
  }

  private async request(path: string): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "runreplay-cli",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const response = await this.fetchImpl(`${this.apiBase}${path}`, { headers });
    if (!response.ok) {
      const body = await response.text();
      let message = `GitHub API returned ${response.status}.`;
      try {
        const parsed = JSON.parse(body) as { message?: string };
        if (parsed.message) message = `GitHub API returned ${response.status}: ${parsed.message}`;
      } catch {
        // Preserve the safe generic message for non-JSON responses.
      }
      throw new GithubApiError(message, response.status);
    }
    return response;
  }
}
