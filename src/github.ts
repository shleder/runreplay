import { GithubArtifact, GithubJob, GithubWorkflowRun, Inspection, JobReference } from "./types.js";

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

  private async get<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "runreplay-cli",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const response = await fetch(`${this.apiBase}${path}`, { headers });
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
    return response.json() as Promise<T>;
  }
}
