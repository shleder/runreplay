import assert from "node:assert/strict";
import test from "node:test";
import { GithubClient } from "./github.js";
import { GithubJob, GithubWorkflowRun, Inspection } from "./types.js";

function job(id: number, name: string, conclusion: string | null): GithubJob {
  return {
    id,
    name,
    status: "completed",
    conclusion,
    html_url: "",
    run_id: 301,
    run_url: "",
    head_sha: "a".repeat(40),
    started_at: null,
    completed_at: null,
    runner_name: null,
    runner_group_name: null,
    runner_labels: ["ubuntu-24.04"],
    steps: [],
  };
}

function workflowRun(id: number, createdAt: string): GithubWorkflowRun {
  return {
    id,
    name: "CI",
    display_title: null,
    event: "push",
    status: "completed",
    conclusion: "success",
    head_branch: "main",
    head_sha: "a".repeat(40),
    html_url: "",
    workflow_id: 7,
    path: ".github/workflows/ci.yml@main",
    created_at: createdAt,
  };
}

const failed: Inspection = {
  reference: { owner: "acme", repo: "widgets", runId: 500, jobId: 700 },
  job: { ...job(700, "test (node 20)", "failure"), run_id: 500 },
  run: { ...workflowRun(500, "2026-01-15T00:00:00Z"), conclusion: "failure" },
  artifacts: [],
  logsApiUrl: "",
};

test("finds a comparable run and job on their second API pages", async () => {
  const requests: string[] = [];
  const firstRunPage = Array.from({ length: 100 }, (_, index) => workflowRun(1_000 + index, "2026-01-16T00:00:00Z"));
  const firstJobPage = Array.from({ length: 100 }, (_, index) => job(2_000 + index, `other job ${index}`, "success"));
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(`${url.pathname}?${url.searchParams}`);
    const page = url.searchParams.get("page");
    if (url.pathname.endsWith("/actions/workflows/7/runs")) {
      return Response.json({ workflow_runs: page === "1" ? firstRunPage : [workflowRun(301, "2026-01-14T00:00:00Z")] });
    }
    if (url.pathname.endsWith("/actions/runs/301/jobs")) {
      return Response.json({ jobs: page === "1" ? firstJobPage : [job(900, "test (node 20)", "success")] });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const client = new GithubClient(undefined, "https://api.example.test", fetchImpl);

  const result = await client.findLastSuccessfulReference(failed);

  assert.deepEqual(result.reference, { owner: "acme", repo: "widgets", runId: 301, jobId: 900 });
  assert.equal(result.limitReached, false);
  assert.equal(result.searchedRuns, 101);
  assert.ok(requests.some((request) => request.includes("/actions/workflows/7/runs?") && request.includes("page=2")));
  assert.ok(requests.some((request) => request.includes("/actions/runs/301/jobs?") && request.includes("page=2")));
});

test("reports the workflow-run search limit instead of claiming no baseline exists", async () => {
  const pageOfNewerRuns = Array.from({ length: 100 }, (_, index) => workflowRun(3_000 + index, "2026-01-16T00:00:00Z"));
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/actions/workflows/7/runs")) return Response.json({ workflow_runs: pageOfNewerRuns });
    throw new Error(`Unexpected request: ${url}`);
  };
  const client = new GithubClient(undefined, "https://api.example.test", fetchImpl);

  const result = await client.findLastSuccessfulReference(failed);

  assert.equal(result.reference, null);
  assert.equal(result.limitReached, true);
  assert.equal(result.searchedRuns, 1_000);
});
