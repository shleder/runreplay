import assert from "node:assert/strict";
import test from "node:test";
import type { CompareReport, NoComparableBaseline } from "./compare.js";
import { buildCiEvidenceBundle } from "./evidence.js";
import type { ResolvedJobContext } from "./types.js";

function context(): ResolvedJobContext {
  return {
    inspection: {
      reference: { owner: "acme", repo: "widgets", runId: 500, jobId: 700 },
      job: {
        id: 700,
        name: "test (node 22)",
        status: "completed",
        conclusion: "failure",
        html_url: "https://github.com/acme/widgets/actions/runs/500/job/700",
        run_id: 500,
        run_url: "https://api.github.com/repos/acme/widgets/actions/runs/500",
        head_sha: "b".repeat(40),
        started_at: "2026-08-07T10:00:00Z",
        completed_at: "2026-08-07T10:01:00Z",
        runner_name: "GitHub Actions 1",
        runner_group_name: "GitHub Actions",
        runner_labels: ["ubuntu-24.04", "X64"],
        steps: [
          {
            name: "Install",
            status: "completed",
            conclusion: "success",
            number: 1,
            started_at: null,
            completed_at: null
          },
          {
            name: "Test",
            status: "completed",
            conclusion: "failure",
            number: 2,
            started_at: null,
            completed_at: null
          }
        ]
      },
      run: {
        id: 500,
        name: "CI",
        display_title: "test failure",
        event: "pull_request",
        status: "completed",
        conclusion: "failure",
        head_branch: "fix/parser",
        head_sha: "b".repeat(40),
        html_url: "https://github.com/acme/widgets/actions/runs/500",
        workflow_id: 7,
        path: ".github/workflows/ci.yml@refs/pull/10/merge",
        created_at: "2026-08-07T10:00:00Z"
      },
      artifacts: [],
      logsApiUrl: "https://api.github.com/repos/acme/widgets/actions/jobs/700/logs"
    },
    workflowSource: "name: CI\n",
    manifest: {
      schemaVersion: "1.1",
      workflow: {
        path: ".github/workflows/ci.yml",
        sourceCommitSha: "b".repeat(40),
        evidence: "workflow-run-api"
      },
      actions: [],
      limitations: ["Runtime logs were unavailable."]
    }
  };
}

function comparison(): CompareReport {
  return {
    schemaVersion: "1.0",
    baseline: {
      repository: "acme/widgets",
      runId: 400,
      jobId: 600,
      commitSha: "a".repeat(40),
      conclusion: "success",
      workflowPath: ".github/workflows/ci.yml",
      event: "pull_request",
      branch: "fix/parser",
      jobName: "test (node 22)"
    },
    failed: {
      repository: "acme/widgets",
      runId: 500,
      jobId: 700,
      commitSha: "b".repeat(40),
      conclusion: "failure",
      workflowPath: ".github/workflows/ci.yml",
      event: "pull_request",
      branch: "fix/parser",
      jobName: "test (node 22)"
    },
    identity: {
      sameRepository: true,
      sameWorkflowPath: true,
      sameJobName: true,
      sameEvent: true,
      sameBranch: true
    },
    changes: {
      workflow: {
        beforeSourceHash: "before",
        afterSourceHash: "after",
        changed: false
      },
      actionRevisions: [],
      runner: {
        beforeLabels: ["ubuntu-24.04", "X64"],
        afterLabels: ["ubuntu-24.04", "X64"],
        changed: false
      },
      steps: [
        {
          name: "Test",
          kind: "changed",
          beforeConclusion: "success",
          afterConclusion: "failure"
        }
      ],
      artifacts: [],
      timing: {
        beforeDurationMs: 50_000,
        afterDurationMs: 60_000,
        deltaMs: 10_000
      },
      repository: {
        totalCommits: 1,
        files: [
          { filename: "src/parser.ts", status: "modified" },
          { filename: "src/parser.test.ts", status: "added" }
        ],
        truncated: false
      }
    },
    changedInputs: ["1 repository commit(s) and 2 reported file(s) changed."],
    limitations: ["Comparison is evidence, not causal proof."]
  };
}

test("builds deterministic machine evidence for downstream automation", () => {
  const first = buildCiEvidenceBundle(context(), comparison());
  const second = buildCiEvidenceBundle(context(), comparison());

  assert.equal(first.schemaVersion, "1.0");
  assert.equal(first.summary.repository, "acme/widgets");
  assert.equal(first.summary.commitSha, "b".repeat(40));
  assert.deepEqual(first.summary.failedSteps, ["Test"]);
  assert.deepEqual(first.summary.changedFiles, ["src/parser.test.ts", "src/parser.ts"]);
  assert.equal(first.summary.baselineAvailable, true);
  assert.match(first.summary.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(first.summary.fingerprint, second.summary.fingerprint);
  assert.deepEqual(first.limitations, [
    "Runtime logs were unavailable.",
    "Comparison is evidence, not causal proof."
  ]);
});

test("keeps a no-baseline outcome explicit instead of inventing changed files", () => {
  const noBaseline: NoComparableBaseline = {
    schemaVersion: "1.0",
    failed: comparison().failed,
    baseline: null,
    reason: "no-comparable-successful-job"
  };

  const bundle = buildCiEvidenceBundle(context(), noBaseline);

  assert.equal(bundle.summary.baselineAvailable, false);
  assert.deepEqual(bundle.summary.changedFiles, []);
  assert.deepEqual(bundle.summary.changedInputs, []);
  assert.match(bundle.limitations.join("\n"), /No comparable successful baseline/);
});
