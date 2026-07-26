import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { githubApiFailureHints, normalizeApiBase, readArguments, redactSensitiveText } from "./cli.js";
import { GithubApiError } from "./github.js";

test("prints help when run as a direct executable", () => {
  const cliPath = fileURLToPath(new URL("./cli.js", import.meta.url));
  const result = spawnSync(process.execPath, [cliPath, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /RunReplay — inspect a GitHub Actions job/);
  assert.match(result.stdout, /--api-base/);
});

test("parses an explicit GitHub Enterprise Server API base", () => {
  assert.deepEqual(
    readArguments([
      "inspect",
      "https://ghe.example.test/acme/widgets/actions/runs/123/job/456",
      "--api-base",
      "https://ghe.example.test/api/v3/",
    ], {}),
    {
      command: "inspect",
      url: "https://ghe.example.test/acme/widgets/actions/runs/123/job/456",
      baselineUrl: undefined,
      baseline: undefined,
      token: undefined,
      apiBase: "https://ghe.example.test/api/v3",
      json: false,
    },
  );
});

test("rejects unsafe API base values", () => {
  assert.throws(() => normalizeApiBase("http://ghe.example.test/api/v3"), /https/);
  assert.throws(() => normalizeApiBase("https://token@ghe.example.test/api/v3"), /credentials/);
  assert.throws(() => normalizeApiBase("https://ghe.example.test/api/v3?token=x"), /query string/);
});

test("explains an invalid or missing GitHub token", () => {
  const hints = githubApiFailureHints(new GithubApiError("GitHub API returned 401: Bad credentials", 401));

  assert.match(hints.join("\n"), /GITHUB_TOKEN/);
  assert.match(hints.join("\n"), /expired, or invalid/);
});

test("explains missing repository permissions", () => {
  const hints = githubApiFailureHints(
    new GithubApiError("GitHub API returned 403: Resource not accessible by integration", 403),
  );

  assert.match(hints.join("\n"), /read access to Actions and Contents/);
});

test("explains primary and secondary rate limits", () => {
  const primary = githubApiFailureHints(
    new GithubApiError("GitHub API returned 403: API rate limit exceeded", 403),
  );
  const secondary = githubApiFailureHints(
    new GithubApiError("GitHub API returned 429: You have exceeded a secondary rate limit", 429),
  );

  assert.match(primary.join("\n"), /rate limit/);
  assert.match(secondary.join("\n"), /rate limit/);
});

test("explains missing jobs, artifacts, or private resources", () => {
  const hints = githubApiFailureHints(new GithubApiError("GitHub API returned 404: Not Found", 404));

  assert.match(hints.join("\n"), /owner, repository, run ID, and job ID/);
  assert.match(hints.join("\n"), /private repositories/);
});

test("explains expired logs and artifacts", () => {
  const hints = githubApiFailureHints(new GithubApiError("GitHub API returned 410: Gone", 410));

  assert.match(hints.join("\n"), /expired/);
  assert.match(hints.join("\n"), /metadata GitHub still retains/);
});

test("redacts tokens and authorization headers from error output", () => {
  const token = "github_pat_exampleSECRET";
  const redacted = redactSensitiveText(
    `GitHub API returned 403: Authorization: Bearer ${token}; ghp_exampleSECRET`,
    token,
  );

  assert.doesNotMatch(redacted, /exampleSECRET/);
  assert.doesNotMatch(redacted, /Authorization:/);
  assert.match(redacted, /\[authorization redacted\]/);
  assert.match(redacted, /ghp_\[redacted\]/);
});
