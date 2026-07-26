/**
 * Opt-in tests against the live GitHub REST API.
 *
 * These are intentionally excluded from `npm test`. Run them explicitly:
 *
 *   RUNREPLAY_INTEGRATION=1 npm run test:integration
 *
 * They target a public GitHub Actions job, so they cost real API budget and
 * depend on GitHub retaining the run. A failure here means either GitHub
 * changed shape, the run aged out, or RunReplay regressed — never a flake to
 * ignore silently. They never read or require a token for public data, but
 * honour GITHUB_TOKEN when present for higher rate limits.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { GithubClient } from "./github.js";
import { parseJobUrl } from "./url.js";

const LIVE = process.env.RUNREPLAY_INTEGRATION === "1";
const { RUNREPLAY_LIVE_JOB_URL } = process.env;

const describe = LIVE ? test : test.skip;

describe("live inspect resolves a real public GitHub Actions job", async () => {
  if (!RUNREPLAY_LIVE_JOB_URL) {
    throw new Error("RUNREPLAY_INTEGRATION=1 requires RUNREPLAY_LIVE_JOB_URL to be set to a public job URL.");
  }
  const client = new GithubClient(process.env.GITHUB_TOKEN);
  const reference = parseJobUrl(RUNREPLAY_LIVE_JOB_URL);
  const inspection = await client.inspect(reference);

  assert.ok(inspection.job.name);
  assert.equal(typeof inspection.run.head_sha, "string");
  assert.equal(inspection.run.head_sha.length, 40);
  assert.ok(Array.isArray(inspection.artifacts));
});

describe("live resolve returns a manifest with explicit evidence for every action", async () => {
  if (!RUNREPLAY_LIVE_JOB_URL) {
    throw new Error("RUNREPLAY_INTEGRATION=1 requires RUNREPLAY_LIVE_JOB_URL to be set to a public job URL.");
  }
  const client = new GithubClient(process.env.GITHUB_TOKEN);
  const manifest = await client.resolve(parseJobUrl(RUNREPLAY_LIVE_JOB_URL));

  assert.equal(manifest.workflow.evidence, "workflow-run-api");
  for (const action of manifest.actions) {
    // Every action carries one of the documented evidence levels; never blank.
    assert.ok(action.evidence, `action ${action.uses} must carry an evidence level`);
  }
});
