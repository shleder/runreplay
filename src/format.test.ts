import assert from "node:assert/strict";
import test from "node:test";
import { formatInspection } from "./format.js";
import { Inspection } from "./types.js";

const inspection: Inspection = {
  reference: { owner: "acme", repo: "widgets", runId: 12, jobId: 34 },
  logsApiUrl: "https://api.github.com/repos/acme/widgets/actions/jobs/34/logs",
  run: { id: 12, name: "CI", display_title: "Test", event: "push", status: "completed", conclusion: "failure", head_branch: "main", head_sha: "deadbeef", html_url: "https://github.com/acme/widgets/actions/runs/12", workflow_id: 1 },
  job: { id: 34, name: "test", status: "completed", conclusion: "failure", html_url: "https://github.com/acme/widgets/actions/runs/12/job/34", run_id: 12, run_url: "", head_sha: "deadbeef", started_at: null, completed_at: null, runner_name: null, runner_group_name: null, runner_labels: ["ubuntu-latest"], steps: [{ name: "Run tests", status: "completed", conclusion: "failure", number: 4, started_at: null, completed_at: null }] },
  artifacts: [{ id: 1, name: "test-results", size_in_bytes: 99, expired: false, archive_download_url: "https://api.github.com/artifacts/1/zip" }],
};

test("formats the key replay facts", () => {
  const output = formatInspection(inspection);
  assert.match(output, /Commit SHA:\s+deadbeef/);
  assert.match(output, /\[failure\] Run tests/);
  assert.match(output, /test-results \(99 bytes; available\)/);
});

test("uses the REST API labels field when runner_labels is absent", () => {
  const apiShapedInspection: Inspection = {
    ...inspection,
    job: { ...inspection.job, runner_labels: undefined, labels: ["ubuntu-latest", "X64"] },
  };
  assert.match(formatInspection(apiShapedInspection), /Runner labels:\s+ubuntu-latest, X64/);
});
