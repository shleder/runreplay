import { JobReference } from "./types.js";

const GITHUB_HOST = "github.com";

/** Parse a GitHub Actions job URL such as /owner/repo/actions/runs/42/job/99. */
export function parseJobUrl(value: string): JobReference {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Expected a full GitHub Actions job URL.");
  }

  if (url.hostname !== GITHUB_HOST && !url.hostname.endsWith(`.${GITHUB_HOST}`)) {
    throw new Error("Expected a URL hosted on github.com.");
  }

  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)\/job\/(\d+)\/?$/);
  if (!match) {
    throw new Error("Expected https://github.com/<owner>/<repo>/actions/runs/<run-id>/job/<job-id>.");
  }

  const [, owner, repo, runId, jobId] = match;
  return { owner, repo, runId: Number(runId), jobId: Number(jobId) };
}
