import assert from "node:assert/strict";
import test from "node:test";
import { CompareReport, NoComparableBaseline } from "./compare.js";
import { formatCompareOutcomeMarkdown } from "./compare-markdown.js";

const BASE_JOB = {
  repository: "acme/widgets",
  runId: 100,
  jobId: 101,
  commitSha: "1111111111111111111111111111111111111111",
  conclusion: "success",
  workflowPath: ".github/workflows/ci.yml",
  event: "push",
  branch: "main",
  jobName: "test",
} as const;

const FAILED_JOB = {
  ...BASE_JOB,
  runId: 200,
  jobId: 201,
  commitSha: "2222222222222222222222222222222222222222",
  conclusion: "failure",
} as const;

function report(overrides: Partial<CompareReport> = {}): CompareReport {
  return {
    schemaVersion: "1.0",
    baseline: BASE_JOB,
    failed: FAILED_JOB,
    identity: {
      sameRepository: true,
      sameWorkflowPath: true,
      sameJobName: true,
      sameEvent: true,
      sameBranch: true,
    },
    changes: {
      workflow: {
        beforeSourceHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        afterSourceHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        changed: false,
      },
      actionRevisions: [],
      runner: {
        beforeLabels: ["ubuntu-24.04"],
        afterLabels: ["ubuntu-24.04"],
        changed: false,
      },
      steps: [],
      artifacts: [],
      timing: {
        beforeDurationMs: 10_000,
        afterDurationMs: 10_000,
        deltaMs: null,
      },
      repository: null,
    },
    changedInputs: [],
    limitations: [],
    ...overrides,
  };
}

test("formats an identical comparison without inventing differences", () => {
  const markdown = formatCompareOutcomeMarkdown(report());

  assert.match(markdown, /^## RunReplay comparison/m);
  assert.match(markdown, /### Failed job/);
  assert.match(markdown, /### Baseline/);
  assert.match(markdown, /Same workflow path: \*\*yes\*\*/);
  assert.match(markdown, /No differences were available from the selected GitHub API evidence/);
  assert.match(markdown, /> These are factual changed inputs, not causal conclusions\./);
  assert.match(markdown, /- None detected\./);
  assert.match(markdown, /- No additional limitations were reported\./);
});

test("formats changed inputs, artifacts, repository files, and limitations", () => {
  const base = report();
  const markdown = formatCompareOutcomeMarkdown({
    ...base,
    changes: {
      ...base.changes,
      workflow: {
        beforeSourceHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        afterSourceHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        changed: true,
      },
      artifacts: [
        {
          name: "report [final].zip",
          kind: "added",
          beforeSizeInBytes: null,
          afterSizeInBytes: 0,
        },
      ],
      repository: {
        totalCommits: 2,
        files: [{ filename: "src/parser|legacy.ts", status: "modified" }],
        truncated: false,
      },
      timing: {
        beforeDurationMs: 10_000,
        afterDurationMs: 12_500,
        deltaMs: 2_500,
      },
    },
    changedInputs: ["Workflow source changed.", "2 repository commit(s) and 1 reported file(s) changed."],
    limitations: [
      "Failed job: Artifact metadata was unavailable.",
      "Failed job: Logs may have expired and cannot be recovered from absent GitHub data.",
    ],
  });

  assert.match(markdown, /#### Workflow/);
  assert.match(markdown, /#### Artifacts/);
  assert.match(markdown, /`report \[final\]\.zip`/);
  assert.match(markdown, /`0` bytes/);
  assert.match(markdown, /#### Repository/);
  assert.match(markdown, /`src\/parser\|legacy\.ts`/);
  assert.match(markdown, /Duration delta: `\+2\.5s`/);
  assert.match(markdown, /- Workflow source changed\./);
  assert.match(markdown, /Artifact metadata was unavailable/);
  assert.match(markdown, /Logs may have expired/);
});

test("formats a no-baseline outcome without guessing", () => {
  const outcome: NoComparableBaseline = {
    schemaVersion: "1.0",
    failed: FAILED_JOB,
    baseline: null,
    reason: "baseline-search-limit-reached",
    searchedRuns: 100,
  };

  const markdown = formatCompareOutcomeMarkdown(outcome);
  assert.match(markdown, /Baseline: \*\*none\*\*/);
  assert.match(markdown, /`baseline-search-limit-reached`/);
  assert.match(markdown, /Successful runs searched: `100`/);
  assert.match(markdown, /did not guess a baseline/);
});

test("uses a safe inline-code fence for values containing backticks", () => {
  const base = report();
  const markdown = formatCompareOutcomeMarkdown({
    ...base,
    changes: {
      ...base.changes,
      steps: [
        {
          name: "run `npm test`",
          kind: "changed",
          beforeConclusion: "success",
          afterConclusion: "failure",
        },
      ],
    },
  });

  assert.match(markdown, /``run `npm test```/);
});
