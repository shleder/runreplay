import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDirectiveUnchanged,
  createFallbackAuditRecord,
  freezeDirective,
  parseFullFilePayload,
  selectFutureCodeAuthorRoute,
  shouldActivateKimiAuthorFallback,
} from "./kimi-author-fallback.js";

const quotaFailure = { kind: "quota-exhausted", confirmed: true, normalRetriesComplete: true } as const;
const payload = '{"task_id":"task-1","files":[{"path":"src/example.ts","content":"export const answer = 42;\\n"}]}';

test("does not activate Kimi author fallback for a 5xx error", () => {
  assert.equal(shouldActivateKimiAuthorFallback({
    kind: "server-error",
    confirmed: true,
    normalRetriesComplete: true,
  }), false);
});

test("activates Kimi author fallback only for confirmed quota exhaustion after retries", () => {
  assert.equal(shouldActivateKimiAuthorFallback(quotaFailure), true);
  assert.equal(shouldActivateKimiAuthorFallback({
    kind: "credential-cooldown",
    confirmed: true,
    normalRetriesComplete: true,
  }), true);
  assert.equal(shouldActivateKimiAuthorFallback({ ...quotaFailure, confirmed: false }), false);
  assert.equal(shouldActivateKimiAuthorFallback({ ...quotaFailure, normalRetriesComplete: false }), false);
});

test("rejects a directive that changes during fallback authorship", () => {
  const frozen = freezeDirective("Implement the allowlisted files exactly as specified.");
  assert.doesNotThrow(() => assertDirectiveUnchanged(frozen, frozen.content));
  assert.throws(() => assertDirectiveUnchanged(frozen, `${frozen.content} Change scope.`), /changed during authorship/);
});

test("requires separate fresh Kimi author and reviewer sessions", () => {
  const directive = freezeDirective("Implement the approved patch.");
  assert.throws(() => createFallbackAuditRecord({
    failure: quotaFailure,
    directive,
    rawPayload: payload,
    authorSessionId: "kimi-session-1",
    reviewerSessionId: "kimi-session-1",
  }), /separate fresh sessions/);
});

test("records the required fallback audit fields and disclosure", () => {
  const directive = freezeDirective("Implement the approved patch.");
  const audit = createFallbackAuditRecord({
    failure: quotaFailure,
    directive,
    rawPayload: payload,
    authorSessionId: "kimi-author-1",
    reviewerSessionId: "kimi-reviewer-1",
  });

  assert.equal(audit.fallbackReason, "quota-exhausted");
  assert.equal(audit.authorRoute, "kimi");
  assert.equal(audit.reviewerRoute, "kimi");
  assert.equal(audit.directiveHash, directive.hash);
  assert.match(audit.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(audit.authoredInFallbackMode, true);
});

test("accepts strict full-file production JSON only", () => {
  assert.deepEqual(parseFullFilePayload(payload), {
    task_id: "task-1",
    files: [{ path: "src/example.ts", content: "export const answer = 42;\n" }],
  });
  assert.throws(() => parseFullFilePayload('{"task_id":"task-1","files":[],"note":"not allowed"}'), /strict full-file/);
});

test("returns future work to Gemini as soon as Gemini is available", () => {
  assert.equal(selectFutureCodeAuthorRoute(false), "kimi-author-fallback");
  assert.equal(selectFutureCodeAuthorRoute(true), "gemini");
});
