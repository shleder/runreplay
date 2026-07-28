import { createHash } from "node:crypto";

export type GeminiFailureKind =
  | "quota-exhausted"
  | "credential-cooldown"
  | "timeout"
  | "server-error"
  | "malformed-output"
  | "transient-error";

export interface GeminiFailure {
  kind: GeminiFailureKind;
  confirmed: boolean;
  normalRetriesComplete: boolean;
}

export interface FrozenDirective {
  content: string;
  hash: string;
}

export interface FullFile {
  path: string;
  content: string;
}

export interface FullFilePayload {
  task_id: string;
  files: FullFile[];
}

export interface FallbackAuditRecord {
  fallbackReason: "quota-exhausted" | "credential-cooldown";
  authorRoute: "kimi";
  directiveHash: string;
  payloadHash: string;
  reviewerRoute: "kimi";
  authorSessionId: string;
  reviewerSessionId: string;
  authoredInFallbackMode: true;
}

const FALLBACK_FAILURES = new Set<GeminiFailureKind>([
  "quota-exhausted",
  "credential-cooldown",
]);

export function shouldActivateKimiAuthorFallback(failure: GeminiFailure): boolean {
  return failure.confirmed && failure.normalRetriesComplete && FALLBACK_FAILURES.has(failure.kind);
}

export function freezeDirective(content: string): FrozenDirective {
  if (content.length === 0) {
    throw new Error("A fallback directive must not be empty.");
  }

  return { content, hash: sha256(content) };
}

export function assertDirectiveUnchanged(frozen: FrozenDirective, candidate: string): void {
  if (sha256(candidate) !== frozen.hash) {
    throw new Error("The frozen Kimi implementation directive changed during authorship.");
  }
}

export function parseFullFilePayload(raw: string): FullFilePayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Fallback author output must be valid JSON.");
  }

  if (!isRecord(parsed) || !hasOnlyKeys(parsed, ["task_id", "files"]) ||
      typeof parsed.task_id !== "string" || parsed.task_id.length === 0 || !Array.isArray(parsed.files) ||
      parsed.files.length === 0) {
    throw new Error("Fallback author output must use the strict full-file production JSON schema.");
  }

  const files = parsed.files.map((file): FullFile => {
    if (!isRecord(file) || !hasOnlyKeys(file, ["path", "content"]) ||
        typeof file.path !== "string" || !isSafeRelativePath(file.path) ||
        typeof file.content !== "string" || file.content.length === 0 || file.content.includes("\u0000")) {
      throw new Error("Fallback author output contains an invalid full-file entry.");
    }
    return { path: file.path, content: file.content };
  });

  return { task_id: parsed.task_id, files };
}

export function createFallbackAuditRecord(input: {
  failure: GeminiFailure;
  directive: FrozenDirective;
  rawPayload: string;
  authorSessionId: string;
  reviewerSessionId: string;
}): FallbackAuditRecord {
  if (!shouldActivateKimiAuthorFallback(input.failure) ||
      (input.failure.kind !== "quota-exhausted" && input.failure.kind !== "credential-cooldown")) {
    throw new Error("Kimi author fallback is not authorized for this Gemini failure.");
  }
  if (input.authorSessionId === input.reviewerSessionId) {
    throw new Error("Kimi author and reviewer must use separate fresh sessions.");
  }

  parseFullFilePayload(input.rawPayload);
  return {
    fallbackReason: input.failure.kind,
    authorRoute: "kimi",
    directiveHash: input.directive.hash,
    payloadHash: sha256(input.rawPayload),
    reviewerRoute: "kimi",
    authorSessionId: input.authorSessionId,
    reviewerSessionId: input.reviewerSessionId,
    authoredInFallbackMode: true,
  };
}

export function selectFutureCodeAuthorRoute(geminiAvailable: boolean): "gemini" | "kimi-author-fallback" {
  return geminiAvailable ? "gemini" : "kimi-author-fallback";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

function isSafeRelativePath(path: string): boolean {
  return path.length > 0 && !path.startsWith("/") && !path.startsWith("\\") &&
    !/^[a-zA-Z]:/.test(path) && !path.split(/[\\/]/).includes("..");
}
