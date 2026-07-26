/**
 * Deterministic, network-free end-to-end tests for the GitHub client.
 *
 * These exercise the real `GithubClient` against the in-memory fixture table
 * in `fixtures.ts`. They assert the public behaviour a user would observe:
 * inspection fields, resolve-manifest evidence levels, comparison changed
 * inputs, baseline-search selection, and honest API error reporting. No test
 * in this file opens a socket or reads a token.
 *
 * For tests against the live GitHub REST API see `live.test.ts`, which is
 * gated behind `RUNREPLAY_INTEGRATION=1` and is intentionally excluded from
 * `npm test`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { GithubApiError, GithubClient } from "./github.js";
import { JobReference } from "./types.js";
import { createFixtureFetch } from "./fixture-client.js";
import {
  FIXTURE,
  baselineFixtures,
  baselineSearchFixtures,
  commitCompareFixtures,
  errorFixture,
  failedFixtures,
} from "./fixtures.js";

const API_BASE = "https://api.github.com";

function baselineRef(): JobReference {
  return { owner: FIXTURE.owner, repo: FIXTURE.repo, runId: FIXTURE.baselineRunId, jobId: FIXTURE.baselineJobId };
}

function failedRef(): JobReference {
  return { owner: FIXTURE.owner, repo: FIXTURE.repo, runId: FIXTURE.failedRunId, jobId: FIXTURE.failedJobId };
}

function client(...routeSets: ReturnType<typeof baselineFixtures>[]) {
  const { fetch, requests } = createFixtureFetch(...routeSets);
  return { client: new GithubClient(undefined, API_BASE, fetch), requests };
}

test("inspect returns job, run, and artifacts from a single resolved job", async () => {
  const { client: gh } = client(baselineFixtures());
  const inspection = await gh.inspect(baselineRef());

  assert.equal(inspection.job.name, "build");
  assert.equal(inspection.job.conclusion, "success");
  assert.equal(inspection.run.head_sha, FIXTURE.baselineSha);
  assert.equal(inspection.run.event, "push");
  assert.equal(inspection.run.head_branch, "main");
  assert.deepEqual(inspection.artifacts, []);
  assert.equal(
    inspection.logsApiUrl,
    `${API_BASE}/repos/${FIXTURE.owner}/${FIXTURE.repo}/actions/jobs/${FIXTURE.baselineJobId}/logs`,
  );
});

test("resolve marks the runtime-log SHA evidence when the runner log names the action", async () => {
  const { client: gh } = client(baselineFixtures());
  const manifest = await gh.resolve(baselineRef());

  assert.equal(manifest.schemaVersion, "1.1");
  assert.equal(manifest.workflow.path, ".github/workflows/ci.yml");
  assert.equal(manifest.workflow.sourceCommitSha, FIXTURE.baselineSha);
  assert.equal(manifest.workflow.evidence, "workflow-run-api");

  const checkout = manifest.actions.find((action) => action.uses === "actions/checkout@v3");
  assert.ok(checkout, "expected the checkout action to be resolved");
  assert.equal(checkout!.kind, "repository");
  assert.equal(checkout!.evidence, "runtime-log");
  assert.equal(checkout!.executedSha, FIXTURE.checkoutV3Sha);
  assert.equal(checkout!.resolvedNowSha, null);
  assert.equal(checkout!.declaredImmutable, false);
});

test("resolve falls back to github-api-current-ref evidence when the runtime log is silent", async () => {
  const { client: gh } = client(failedFixtures());
  const manifest = await gh.resolve(failedRef());

  const checkout = manifest.actions.find((action) => action.uses === "actions/checkout@v4");
  assert.ok(checkout);
  assert.equal(checkout!.evidence, "github-api-current-ref");
  assert.equal(checkout!.executedSha, null);
  assert.equal(checkout!.resolvedNowSha, FIXTURE.checkoutV4Sha);
  assert.equal(checkout!.declaredImmutable, false);
});

test("compare surfaces the moved checkout ref and the changed repository file as changed inputs", async () => {
  const { client: gh } = client(baselineFixtures(), failedFixtures(), commitCompareFixtures());
  const outcome = await gh.compare(failedRef(), baselineRef());

  if (!("baseline" in outcome && outcome.baseline)) throw new Error("expected a comparison report");
  assert.equal(outcome.identity.sameJobName, true);
  assert.equal(outcome.identity.sameBranch, true);
  assert.equal(outcome.changes.workflow.changed, true);

  // The checkout ref moved from @v3 to @v4. Because the two declarations differ
  // as map keys, compareActions reports them as two entries: @v3 now absent,
  // @v4 now present with current-ref evidence.
  const checkoutChanges = outcome.changes.actionRevisions.filter((change) => change.uses.startsWith("actions/checkout"));
  assert.ok(checkoutChanges.length >= 1, "expected the checkout ref change to be reported");
  const v4 = checkoutChanges.find((change) => change.uses === "actions/checkout@v4");
  assert.ok(v4, "expected the new checkout@v4 declaration");
  assert.ok(v4!.after.executedSha !== null || v4!.after.resolvedNowSha !== null, "v4 must carry a resolved SHA");

  assert.ok(outcome.changes.repository, "expected a commit comparison");
  assert.equal(outcome.changes.repository!.totalCommits, 1);
  assert.deepEqual(
    outcome.changes.repository!.files.map((file) => file.filename),
    ["src/widgets.ts"],
  );

  assert.ok(
    outcome.changedInputs.some((line) => line.includes("Action declaration or revision changed")),
    "changedInputs must mention the Action change",
  );
  assert.ok(
    outcome.changedInputs.some((line) => line.includes("repository commit(s)")),
    "changedInputs must mention the changed repository file(s)",
  );
});

test("compareWithLastSuccessful finds the earlier green run of the same job", async () => {
  const { client: gh, requests } = client(
    failedFixtures(),
    baselineSearchFixtures(),
    baselineFixtures(),
    commitCompareFixtures(),
  );
  const outcome = await gh.compareWithLastSuccessful(failedRef());

  if (!("baseline" in outcome) || !outcome.baseline) throw new Error("expected a baseline to be selected");
  assert.equal(outcome.baseline.runId, FIXTURE.baselineRunId);
  assert.equal(outcome.baseline.jobId, FIXTURE.baselineJobId);
  assert.equal(outcome.baseline.commitSha, FIXTURE.baselineSha);
  // The workflow-runs listing is consulted once; the selected run's jobs once.
  assert.ok(requests.some((r) => r.pathname.endsWith(`/actions/workflows/${FIXTURE.workflowId}/runs`)));
  assert.ok(requests.some((r) => r.pathname.endsWith(`/actions/runs/${FIXTURE.baselineRunId}/jobs`)));
});

test("a 401 surfaces as a GithubApiError with the documented status", async () => {
  const { client: gh } = client(errorFixture(401, "Bad credentials"), baselineFixtures());
  await assert.rejects(
    () => gh.inspect(baselineRef()),
    (error: unknown) => error instanceof GithubApiError && error.status === 401,
  );
});

test("a 403 (rate limit) surfaces as a GithubApiError with status 403", async () => {
  const { client: gh } = client(errorFixture(403, "API rate limit exceeded"), failedFixtures());
  await assert.rejects(
    () => gh.inspect(failedRef()),
    (error: unknown) => error instanceof GithubApiError && error.status === 403,
  );
});

test("a 404 on a run surfaces as a GithubApiError with status 404", async () => {
  const { client: gh } = client(errorFixture(404, "Not Found"), baselineFixtures());
  await assert.rejects(
    () => gh.inspect(baselineRef()),
    (error: unknown) => error instanceof GithubApiError && error.status === 404,
  );
});

test("a 410 (gone, e.g. expired logs) degrades the runtime log but does not fail resolve", async () => {
  // resolveContext swallows the log-download error and reports it as a
  // limitation, so the manifest still resolves with current-ref evidence.
  const { client: gh } = client(errorFixture(410, "Gone"), failedFixtures());
  const manifest = await gh.resolve(failedRef());
  assert.ok(
    manifest.limitations.some((line) => line.includes("Runtime logs unavailable")),
    "expected a runtime-log unavailability limitation",
  );
});

test("the fixture router rejects any request it has no route for, proving no network call is possible", async () => {
  const { client: gh } = client(baselineFixtures());
  // A reference the fixtures never describe resolves to an unrouted URL.
  await assert.rejects(
    () => gh.inspect({ owner: "nope", repo: "nope", runId: 1, jobId: 1 }),
    /unrouted request/,
  );
});
