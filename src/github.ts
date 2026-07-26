import { resolveManifest, workflowPathFromRun } from "./resolve.js";
import { GithubArtifact, GithubJob, GithubWorkflowRun, Inspection, JobReference, ResolveManifest } from "./types.js";

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

    return resolveManifest(
      { inspection, workflowSource, runtimeLogs, runtimeLogsUnavailableReason },
      {
        resolveCurrentRef: (repository, ref) => this.getCommitSha(reference.owner, reference.repo, repository, ref),
        verifyDeclaredSha: (repository, sha) => this.getCommitSha(reference.owner, reference.repo, repository, sha),
      },
    );
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
