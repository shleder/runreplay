import assert from "node:assert/strict";
import test from "node:test";
import { compareResolvedJobs, isComparableSuccessfulJob } from "./compare.js";
import { GithubJob, GithubWorkflowRun, ResolvedJobContext } from "./types.js";

const BASE_SHA = "1111111111111111111111111111111111111111";
const FAILED_SHA = "2222222222222222222222222222222222222222";
const CHECKOUT_BEFORE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CHECKOUT_AFTER = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function job(id: number, conclusion: string | null, labels = ["ubuntu-24.04"]): GithubJob {
  return {
    id,
    name: "test (node 20)",
    status: "completed",
    conclusion,
    html_url: "",
    run_id: id + 100,
    run_url: "",
    head_sha: id === 1 ? BASE_SHA : FAILED_SHA,
    started_at: "2026-07-26T10:00:00Z",
    completed_at: id === 1 ? "2026-07-26T10:01:00Z" : "2026-07-26T10:02:30Z",
    runner_name: "GitHub Actions",
    runner_group_name: "GitHub Actions",
    runner_labels: labels,
    steps: [
      { number: 1, name: "Set up job", status: "completed", conclusion: "success", started_at: null, completed_at: null },
      { number: 2, name: "Run tests", status: "completed", conclusion, started_at: null, completed_at: null },
    ],
  };
}

function run(id: number, sha: string, conclusion: string | null, branch = "main"): GithubWorkflowRun {
  return {
    id,
    name: "CI",
    display_title: null,
    event: "push",
    status: "completed",
    conclusion,
    head_branch: branch,
    head_sha: sha,
    html_url: "",
    workflow_id: 7,
    path: ".github/workflows/ci.yml@main",
    created_at: id === 101 ? "2026-07-26T10:00:00Z" : "2026-07-26T11:00:00Z",
  };
}

function context(id: number, conclusion: string | null, source: string, executedSha: string, labels = ["ubuntu-24.04"]): ResolvedJobContext {
  const sha = id === 1 ? BASE_SHA : FAILED_SHA;
  return {
    inspection: {
      reference: { owner: "acme", repo: "widgets", runId: id + 100, jobId: id },
      job: job(id, conclusion, labels),
      run: run(id + 100, sha, conclusion),
      artifacts: id === 1 ? [] : [{ id: 7, name: "test-results", size_in_bytes: 12, expired: false, archive_download_url: "" }],
      logsApiUrl: "",
    },
    workflowSource: source,
    manifest: {
      schemaVersion: "1.1",
      workflow: { path: ".github/workflows/ci.yml", sourceCommitSha: sha, evidence: "workflow-run-api" },
      actions: [{
        uses: "actions/checkout@v4",
        kind: "repository",
        repository: "actions/checkout",
        declaredRef: "v4",
        declaredImmutable: false,
        executedSha,
        resolvedNowSha: null,
        evidence: "runtime-log",
      }],
      limitations: [],
    },
  };
}

test("compares workflow, runtime Action SHA, runner, files, artifacts, and duration", () => {
  const baseline = context(1, "success", "jobs: { test: { timeout-minutes: 30 } }", CHECKOUT_BEFORE);
  const failed = context(2, "failure", "jobs: { test: { timeout-minutes: 15 } }", CHECKOUT_AFTER, ["ubuntu-24.04", "x64"]);
  const report = compareResolvedJobs(baseline, failed, {
    totalCommits: 4,
    files: [{ filename: "package-lock.json", status: "modified" }],
    truncated: false,
  });

  assert.equal(report.changes.workflow.changed, true);
  assert.deepEqual(report.changes.runner.afterLabels, ["ubuntu-24.04", "x64"]);
  assert.equal(report.changes.actionRevisions[0].before.executedSha, CHECKOUT_BEFORE);
  assert.equal(report.changes.actionRevisions[0].after.executedSha, CHECKOUT_AFTER);
  assert.deepEqual(report.changes.artifacts, [{ name: "test-results", kind: "added", beforeSizeInBytes: null, afterSizeInBytes: 12 }]);
  assert.equal(report.changes.timing.deltaMs, 90_000);
  assert.match(report.changedInputs.join("\n"), /4 repository commit/);
});

test("requires exact job, event, branch, runner labels, and successful conclusions for an automatic baseline", () => {
  const failedRun = run(102, FAILED_SHA, "failure");
  const failedJob = job(2, "failure");
  assert.equal(isComparableSuccessfulJob(failedRun, failedJob, run(101, BASE_SHA, "success"), job(1, "success")), true);
  assert.equal(isComparableSuccessfulJob(failedRun, failedJob, run(101, BASE_SHA, "success", "release"), job(1, "success")), false);
  assert.equal(isComparableSuccessfulJob(failedRun, failedJob, run(101, BASE_SHA, "success"), job(1, "success", ["ubuntu-22.04"])), false);
  assert.equal(isComparableSuccessfulJob(failedRun, failedJob, run(101, BASE_SHA, "success"), { ...job(1, "success"), name: "lint" }), false);
});
