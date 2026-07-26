import assert from "node:assert/strict";
import test from "node:test";
import { parseJobUrl } from "./url.js";

test("parses a standard GitHub Actions job URL", () => {
  assert.deepEqual(
    parseJobUrl("https://github.com/acme/widgets/actions/runs/123/job/456"),
    { owner: "acme", repo: "widgets", runId: 123, jobId: 456 },
  );
});

test("accepts a trailing slash and query string", () => {
  assert.deepEqual(
    parseJobUrl("https://github.com/acme/widgets/actions/runs/123/job/456/?check_suite_focus=true"),
    { owner: "acme", repo: "widgets", runId: 123, jobId: 456 },
  );
});

test("rejects a workflow run URL without a job", () => {
  assert.throws(() => parseJobUrl("https://github.com/acme/widgets/actions/runs/123"), /Expected https/);
});
