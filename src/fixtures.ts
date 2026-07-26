/**
 * Deterministic, network-free GitHub Actions API fixtures.
 *
 * These payloads model a realistic two-run comparison scenario: a successful
 * baseline run and a later failed run of the same job, where one Action moved
 * its declared ref (`actions/checkout` v3 -> v4) and one repository file
 * changed between the two commits. They exercise every code path the real
 * client hits, including pagination, runtime-log SHA extraction, current-ref
 * resolution, the commit-compare endpoint, and the common API error statuses.
 *
 * No fixture here is ever contacted over the network. `createFixtureFetch`
 * routes URLs to these payloads locally; `RUNREPLAY_LIVE` integration tests
 * use the live GitHub REST API instead.
 */

const BASELINE_SHA = "1111111111111111111111111111111111111111";
const FAILED_SHA = "2222222222222222222222222222222222222222";
const CHECKOUT_V4_SHA = "4444444444444444444444444444444444444444";
const CHECKOUT_V3_FULL_SHA = "3333333333333333333333333333333333333333";

export const FIXTURE = {
  owner: "acme",
  repo: "widgets",
  workflowId: 42,
  baselineRunId: 5_000,
  baselineJobId: 7_000,
  failedRunId: 5_001,
  failedJobId: 7_001,
  baselineSha: BASELINE_SHA,
  failedSha: FAILED_SHA,
  checkoutV3Sha: CHECKOUT_V3_FULL_SHA,
  checkoutV4Sha: CHECKOUT_V4_SHA,
} as const;

const baselineWorkflowSource = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v3
      - run: npm ci && npm test
`;

// Between the two runs only the checkout Action ref moved: v3 -> v4.
const failedWorkflowSource = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
`;

// The runner log preserves the full `owner/repo@ref` declaration, which is
// what parseRuntimeActionShas keys on. Keeping the ref lets the baseline
// resolve checkout as `runtime-log` evidence without an API call.
const runtimeLogs = [
  "2026-01-15T00:00:00.000Z Current runner version:",
  `2026-01-15T00:00:01.000Z Download action repository 'actions/checkout@v3' (SHA:${CHECKOUT_V3_FULL_SHA})`,
  "2026-01-15T00:00:02.000Z Prepare workflow directory",
].join("\n");

function jobFixture(jobId: number, runId: number, conclusion: string | null, headSha: string) {
  return {
    id: jobId,
    name: "build",
    status: "completed",
    conclusion,
    html_url: `https://github.com/acme/widgets/runs/${runId}/job/${jobId}`,
    run_id: runId,
    run_url: `https://api.github.com/repos/acme/widgets/actions/runs/${runId}`,
    head_sha: headSha,
    started_at: "2026-01-15T00:00:00Z",
    completed_at: "2026-01-15T00:01:00Z",
    runner_name: "github-actions-runner",
    runner_group_name: "GitHub Actions",
    labels: ["ubuntu-24.04"],
    steps: [
      { name: "Set up job", status: "completed", conclusion: "success", number: 1, started_at: null, completed_at: null },
      { name: "Run actions/checkout@v4", status: "completed", conclusion: conclusion ?? "success", number: 2, started_at: null, completed_at: null },
      { name: "Run npm ci && npm test", status: "completed", conclusion, number: 3, started_at: null, completed_at: null },
    ],
  };
}

function runFixture(runId: number, conclusion: string | null, headSha: string, createdAt: string) {
  return {
    id: runId,
    name: "CI",
    display_title: "push",
    event: "push",
    status: "completed",
    conclusion,
    head_branch: "main",
    head_sha: headSha,
    html_url: `https://github.com/acme/widgets/actions/runs/${runId}`,
    workflow_id: FIXTURE.workflowId,
    path: ".github/workflows/ci.yml@main",
    created_at: createdAt,
  };
}

/** GitHub contents-API encoding for a workflow file at a given commit. */
function workflowContent(source: string) {
  return {
    type: "file",
    encoding: "base64",
    content: Buffer.from(source).toString("base64"),
  };
}

/**
 * One entry per GitHub REST endpoint the client calls during inspect/resolve/
 * compare. Order is irrelevant: the router matches on path + query.
 */
export interface FixtureRoute {
  /** Matched against the full pathname. May use the `*` wildcard. */
  match: string;
  /** Return the JSON body for this path. */
  json?: () => unknown;
  /** Return the text body for this path (overrides json for log endpoints). */
  text?: () => string;
  /** HTTP status returned instead of 200. */
  status?: number;
}

export function baselineFixtures(): FixtureRoute[] {
  const p = `/repos/${FIXTURE.owner}/${FIXTURE.repo}`;
  return [
    {
      match: `${p}/actions/jobs/${FIXTURE.baselineJobId}`,
      json: () => jobFixture(FIXTURE.baselineJobId, FIXTURE.baselineRunId, "success", FIXTURE.baselineSha),
    },
    {
      match: `${p}/actions/runs/${FIXTURE.baselineRunId}`,
      json: () => runFixture(FIXTURE.baselineRunId, "success", FIXTURE.baselineSha, "2026-01-14T00:00:00Z"),
    },
    {
      match: `${p}/actions/runs/${FIXTURE.baselineRunId}/artifacts`,
      json: () => ({ artifacts: [] }),
    },
    {
      // Tie the workflow source to the baseline commit via its ?ref= query,
      // so baseline and failed return genuinely different sources.
      match: `${p}/contents/.github/workflows/ci.yml?ref=${FIXTURE.baselineSha}`,
      json: () => workflowContent(baselineWorkflowSource),
    },
    {
      match: `${p}/actions/jobs/${FIXTURE.baselineJobId}/logs`,
      text: () => runtimeLogs,
    },
    {
      match: `${p}/commits/1111111111111111111111111111111111111111`,
      json: () => ({ sha: FIXTURE.baselineSha }),
    },
  ];
}

export function failedFixtures(): FixtureRoute[] {
  const p = `/repos/${FIXTURE.owner}/${FIXTURE.repo}`;
  return [
    {
      match: `${p}/actions/jobs/${FIXTURE.failedJobId}`,
      json: () => jobFixture(FIXTURE.failedJobId, FIXTURE.failedRunId, "failure", FIXTURE.failedSha),
    },
    {
      match: `${p}/actions/runs/${FIXTURE.failedRunId}`,
      json: () => runFixture(FIXTURE.failedRunId, "failure", FIXTURE.failedSha, "2026-01-15T00:00:00Z"),
    },
    {
      match: `${p}/actions/runs/${FIXTURE.failedRunId}/artifacts`,
      json: () => ({ artifacts: [] }),
    },
    {
      match: `${p}/contents/.github/workflows/ci.yml?ref=${FIXTURE.failedSha}`,
      json: () => workflowContent(failedWorkflowSource),
    },
    {
      match: `${p}/actions/jobs/${FIXTURE.failedJobId}/logs`,
      text: () => runtimeLogs,
    },
    {
      // The failed run declares checkout@v4, which the runtime log does not
      // mention, so the client resolves the current ref against the
      // actions/checkout repository itself (not the inspected repo).
      match: `/repos/actions/checkout/commits/v4`,
      json: () => ({ sha: FIXTURE.checkoutV4Sha }),
    },
  ];
}

/**
 * Baseline-search fixtures: the workflow-runs listing must surface the
 * baseline run as an earlier successful run of the same job, which the client
 * then selects via the strict matching predicate.
 */
export function baselineSearchFixtures(): FixtureRoute[] {
  const p = `/repos/${FIXTURE.owner}/${FIXTURE.repo}`;
  return [
    {
      match: `${p}/actions/workflows/${FIXTURE.workflowId}/runs`,
      json: () => ({
        workflow_runs: [
          runFixture(FIXTURE.failedRunId, "failure", FIXTURE.failedSha, "2026-01-15T00:00:00Z"),
          runFixture(FIXTURE.baselineRunId, "success", FIXTURE.baselineSha, "2026-01-14T00:00:00Z"),
        ],
      }),
    },
    {
      match: `${p}/actions/runs/${FIXTURE.baselineRunId}/jobs`,
      json: () => ({ jobs: [jobFixture(FIXTURE.baselineJobId, FIXTURE.baselineRunId, "success", FIXTURE.baselineSha)] }),
    },
  ];
}

/** The repository commit comparison between baseline and failed SHA. */
export function commitCompareFixtures(): FixtureRoute[] {
  const p = `/repos/${FIXTURE.owner}/${FIXTURE.repo}`;
  return [
    {
      match: `${p}/compare/${FIXTURE.baselineSha}...${FIXTURE.failedSha}`,
      json: () => ({
        total_commits: 1,
        files: [{ filename: "src/widgets.ts", status: "modified" }],
      }),
    },
  ];
}

/**
 * A single API error route. `inspect()` fans out to job + run + artifacts in
 * parallel, so each error scenario must inject exactly one failing endpoint
 * on top of an otherwise-complete fixture set, otherwise a different error
 * surfaces first and masks the one under test.
 */
export function errorFixture(status: number, message: string): FixtureRoute[] {
  const p = `/repos/${FIXTURE.owner}/${FIXTURE.repo}`;
  const byStatus: Record<number, string> = {
    401: `${p}/actions/jobs/${FIXTURE.baselineJobId}`,
    403: `${p}/actions/jobs/${FIXTURE.failedJobId}`,
    404: `${p}/actions/runs/${FIXTURE.baselineRunId}`,
    410: `${p}/actions/jobs/${FIXTURE.failedJobId}/logs`,
  };
  const match = byStatus[status];
  if (!match) throw new Error(`no error route defined for status ${status}`);
  return [{ match, status, json: () => ({ message }) }];
}
