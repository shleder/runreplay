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

test("parses a GitHub Enterprise Server job URL when explicitly allowed", () => {
  assert.deepEqual(
    parseJobUrl("https://ghe.example.test/acme/widgets/actions/runs/123/job/456", { allowEnterpriseHost: true }),
    { owner: "acme", repo: "widgets", runId: 123, jobId: 456 },
  );
});

test("rejects a GitHub Enterprise Server job URL without an explicit API base", () => {
  assert.throws(
    () => parseJobUrl("https://ghe.example.test/acme/widgets/actions/runs/123/job/456"),
    /--api-base/,
  );
});

test("rejects non-HTTPS GitHub Enterprise Server job URLs", () => {
  assert.throws(
    () => parseJobUrl("http://ghe.example.test/acme/widgets/actions/runs/123/job/456", { allowEnterpriseHost: true }),
    /https/,
  );
});

test("rejects a workflow run URL without a job", () => {
  assert.throws(() => parseJobUrl("https://github.com/acme/widgets/actions/runs/123"), /Expected https/);
});
