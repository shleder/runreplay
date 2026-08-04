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

test("rejects malformed GitHub Actions job URLs with clear errors", () => {
  const cases = [
    {
      name: "non-numeric run ID",
      value: "https://github.com/acme/widgets/actions/runs/not-a-number/job/42",
      message: "Expected https://github.com/<owner>/<repo>/actions/runs/<run-id>/job/<job-id>.",
    },
    {
      name: "non-numeric job ID",
      value: "https://github.com/acme/widgets/actions/runs/42/job/not-a-number",
      message: "Expected https://github.com/<owner>/<repo>/actions/runs/<run-id>/job/<job-id>.",
    },
    {
      name: "extra path segments",
      value: "https://github.com/acme/widgets/actions/runs/42/job/42/extra",
      message: "Expected https://github.com/<owner>/<repo>/actions/runs/<run-id>/job/<job-id>.",
    },
    {
      name: "missing job path",
      value: "https://github.com/acme/widgets/actions/runs/42",
      message: "Expected https://github.com/<owner>/<repo>/actions/runs/<run-id>/job/<job-id>.",
    },
    {
      name: "HTTP github.com URL",
      value: "http://github.com/acme/widgets/actions/runs/42/job/42",
      message: "Expected an https GitHub Actions job URL.",
    },
    {
      name: "embedded credentials",
      value: "https://user:secret@github.com/acme/widgets/actions/runs/42/job/42",
      message: "Expected a GitHub Actions job URL without embedded credentials.",
    },
    {
      name: "empty string",
      value: "",
      message: "Expected a full GitHub Actions job URL.",
    },
    {
      name: "non-URL string",
      value: "not a URL",
      message: "Expected a full GitHub Actions job URL.",
    },
  ];

  for (const testCase of cases) {
    assert.throws(() => parseJobUrl(testCase.value), { message: testCase.message }, testCase.name);
  }
});
