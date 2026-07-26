import assert from "node:assert/strict";
import test from "node:test";
import { resolveManifest, workflowPathFromRun } from "./resolve.js";
import { Inspection } from "./types.js";

const DECLARED_SHA = "11bd71901bbe5b1630ceea73d27597364c9af683";
const RUNTIME_SHA = "1234567890abcdef1234567890abcdef12345678";
const CURRENT_SHA = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

function inspection(path = ".github/workflows/ci.yml@main"): Inspection {
  return {
    reference: { owner: "acme", repo: "widgets", runId: 7, jobId: 9 },
    logsApiUrl: "https://api.github.com/repos/acme/widgets/actions/jobs/9/logs",
    run: { id: 7, name: "CI", display_title: null, event: "push", status: "completed", conclusion: "failure", head_branch: "main", head_sha: "feedfacefeedfacefeedfacefeedfacefeedface", html_url: "", workflow_id: 3, path },
    job: { id: 9, name: "test", status: "completed", conclusion: "failure", html_url: "", run_id: 7, run_url: "", head_sha: "feedfacefeedfacefeedfacefeedfacefeedface", started_at: null, completed_at: null, runner_name: null, runner_group_name: null, steps: [] },
    artifacts: [],
  };
}

const resolver = {
  resolveCurrentRef: async () => CURRENT_SHA,
  verifyDeclaredSha: async () => DECLARED_SHA,
};

async function resolve(workflowSource: string, runtimeLogs: string | null = null, runtimeLogsUnavailableReason?: string) {
  return resolveManifest({ inspection: inspection(), workflowSource, runtimeLogs, runtimeLogsUnavailableReason }, resolver);
}

test("records a declared full SHA as immutable evidence", async () => {
  const manifest = await resolve(`jobs:\n  test:\n    steps:\n      - uses: actions/checkout@${DECLARED_SHA}`);
  assert.deepEqual(manifest.actions[0], {
    uses: `actions/checkout@${DECLARED_SHA}`,
    kind: "repository",
    repository: "actions/checkout",
    declaredRef: DECLARED_SHA,
    declaredImmutable: true,
    executedSha: DECLARED_SHA,
    resolvedNowSha: null,
    evidence: "declared-full-sha",
  });
});

test("uses a matching runtime log SHA for a mutable tag", async () => {
  const manifest = await resolve(
    "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4",
    `Download action repository 'actions/checkout@v4' (SHA:${RUNTIME_SHA})`,
  );
  assert.equal(manifest.actions[0].evidence, "runtime-log");
  assert.equal(manifest.actions[0].executedSha, RUNTIME_SHA);
  assert.equal(manifest.actions[0].resolvedNowSha, null);
});

test("resolves an action declared in a repository subdirectory", async () => {
  const uses = "github/codeql-action/init@v4";
  const manifest = await resolve(
    `jobs:\n  test:\n    steps:\n      - uses: ${uses}`,
    `Download action repository 'github/codeql-action@v4' (SHA:${RUNTIME_SHA})`,
  );
  assert.equal(manifest.actions[0].repository, "github/codeql-action");
  assert.equal(manifest.actions[0].evidence, "runtime-log");
  assert.equal(manifest.actions[0].executedSha, RUNTIME_SHA);
});

test("labels a tag resolved through the API as current, not historical", async () => {
  const manifest = await resolve("jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4");
  assert.equal(manifest.actions[0].evidence, "github-api-current-ref");
  assert.equal(manifest.actions[0].executedSha, null);
  assert.equal(manifest.actions[0].resolvedNowSha, CURRENT_SHA);
});

test("marks local actions as unresolved rather than inventing a SHA", async () => {
  const manifest = await resolve("jobs:\n  test:\n    steps:\n      - uses: ./.github/actions/local");
  assert.equal(manifest.actions[0].kind, "local");
  assert.equal(manifest.actions[0].reason, "local-action-not-resolved-in-v0.2");
});

test("marks Docker actions as unresolved", async () => {
  const manifest = await resolve("jobs:\n  test:\n    steps:\n      - uses: docker://node:24");
  assert.equal(manifest.actions[0].kind, "docker");
  assert.equal(manifest.actions[0].reason, "docker-action-not-resolved-in-v0.2");
});

test("marks dynamic expressions as unresolved", async () => {
  const manifest = await resolve("jobs:\n  test:\n    steps:\n      - uses: actions/checkout@${{ inputs.action_ref }}");
  assert.equal(manifest.actions[0].kind, "dynamic");
  assert.equal(manifest.actions[0].reason, "dynamic-expression");
});

test("keeps the workflow path and source commit supplied by the historical run", async () => {
  const manifest = await resolveManifest({
    inspection: inspection(".github/workflows/deleted-on-main.yml@main"),
    workflowSource: "jobs: {}",
    runtimeLogs: null,
  }, resolver);
  assert.equal(manifest.workflow.path, ".github/workflows/deleted-on-main.yml");
  assert.equal(manifest.workflow.sourceCommitSha, "feedfacefeedfacefeedfacefeedfacefeedface");
  assert.equal(workflowPathFromRun(".github/workflows/ci.yml@feature/ref"), ".github/workflows/ci.yml");
});

test("reports a mismatch between a declaration and another runtime ref", async () => {
  const manifest = await resolve(
    "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4",
    `Download action repository 'actions/checkout@v3' (SHA:${RUNTIME_SHA})`,
  );
  assert.equal(manifest.actions[0].evidence, "github-api-current-ref");
  assert.match(manifest.limitations.join("\n"), /declared actions\/checkout@v4/);
});

test("records expired logs as a limitation", async () => {
  const manifest = await resolve("jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4", null, "GitHub API 410");
  assert.match(manifest.limitations.join("\n"), /Runtime logs unavailable: GitHub API 410/);
  assert.equal(manifest.actions[0].evidence, "github-api-current-ref");
});

test("marks reusable workflows as explicitly unsupported", async () => {
  const manifest = await resolve("jobs:\n  call-build:\n    uses: acme/workflows/.github/workflows/build.yml@v1");
  assert.equal(manifest.actions[0].kind, "reusable-workflow");
  assert.equal(manifest.actions[0].reason, "unsupported-reusable-workflow");
});
