import assert from "node:assert/strict";
import test from "node:test";
import { toJsonInspection } from "./json.js";
import { Inspection } from "./types.js";

const inspection: Inspection = {
  reference: { owner: "actions", repo: "checkout", runId: 123, jobId: 456 },
  logsApiUrl: "https://api.github.com/repos/actions/checkout/actions/jobs/456/logs",
  run: { id: 123, name: "CI", display_title: null, event: "push", status: "completed", conclusion: "failure", head_branch: "main", head_sha: "abc123", html_url: "", workflow_id: 1, path: ".github/workflows/ci.yml@main", created_at: "2026-07-26T10:00:00Z" },
  job: { id: 456, name: "test", status: "completed", conclusion: "failure", html_url: "", run_id: 123, run_url: "", head_sha: "abc123", started_at: null, completed_at: null, runner_name: null, runner_group_name: null, labels: ["ubuntu-latest"], steps: [{ name: "Run tests", status: "completed", conclusion: "failure", number: 3, started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:01:00Z" }] },
  artifacts: [{
    id: 7,
    url: "https://api.github.com/repos/actions/checkout/actions/artifacts/7",
    name: "test-results",
    size_in_bytes: 42,
    expired: false,
    created_at: "2026-07-26T10:02:00Z",
    updated_at: "2026-07-26T10:03:00Z",
    expires_at: "2026-08-25T10:02:00Z",
    digest: "sha256:abc123",
    archive_download_url: "https://api.github.com/artifacts/7/zip",
    workflow_run: {
      id: 123,
      repository_id: 99,
      head_repository_id: 100,
      head_branch: "main",
      head_sha: "abc123",
    },
  }],
};

test("creates the documented stable JSON schema", () => {
  assert.deepEqual(toJsonInspection(inspection), {
    schemaVersion: "1.0",
    repository: "actions/checkout",
    runId: 123,
    jobId: 456,
    commitSha: "abc123",
    event: "push",
    runner: { labels: ["ubuntu-latest"] },
    steps: [{ number: 3, name: "Run tests", status: "completed", conclusion: "failure", startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:01:00Z" }],
    artifacts: [{
      id: 7,
      name: "test-results",
      sizeInBytes: 42,
      expired: false,
      availability: "available",
      createdAt: "2026-07-26T10:02:00Z",
      updatedAt: "2026-07-26T10:03:00Z",
      expiresAt: "2026-08-25T10:02:00Z",
      digest: "sha256:abc123",
      workflowRun: {
        id: 123,
        repositoryId: 99,
        headRepositoryId: 100,
        headBranch: "main",
        headSha: "abc123",
      },
      apiUrl: "https://api.github.com/repos/actions/checkout/actions/artifacts/7",
      archiveDownloadUrl: "https://api.github.com/artifacts/7/zip",
    }],
    logsApiUrl: "https://api.github.com/repos/actions/checkout/actions/jobs/456/logs",
    redactions: [],
  });
});

test("fills absent artifact metadata with nulls", () => {
  const legacyInspection: Inspection = {
    ...inspection,
    artifacts: [{
      id: 8,
      name: "legacy",
      size_in_bytes: 1,
      expired: true,
      archive_download_url: "https://api.github.com/artifacts/8/zip",
    }],
  };

  assert.deepEqual(toJsonInspection(legacyInspection).artifacts, [{
    id: 8,
    name: "legacy",
    sizeInBytes: 1,
    expired: true,
    availability: "expired",
    createdAt: null,
    updatedAt: null,
    expiresAt: null,
    digest: null,
    workflowRun: null,
    apiUrl: null,
    archiveDownloadUrl: "https://api.github.com/artifacts/8/zip",
  }]);
});
