import { parseDocument } from "yaml";
import { ActionKind, Inspection, ResolveManifest, ResolvedAction } from "./types.js";

export interface RefResolver {
  resolveCurrentRef(repository: string, ref: string): Promise<string>;
  verifyDeclaredSha(repository: string, sha: string): Promise<string>;
}

export interface ResolveInput {
  inspection: Inspection;
  workflowSource: string;
  runtimeLogs: string | null;
  runtimeLogsUnavailableReason?: string;
}

const FULL_SHA = /^[a-f0-9]{40}$/i;
const RUNTIME_ACTION = /Download action repository '([^']+)' \(SHA:([a-f0-9]{40})\)/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function workflowPathFromRun(path: string): string {
  return path.split("@", 1)[0];
}

/** Parse all action SHAs explicitly emitted by a GitHub Actions runner. */
export function parseRuntimeActionShas(logs: string): Map<string, string[]> {
  const matches = new Map<string, string[]>();
  for (const match of logs.matchAll(RUNTIME_ACTION)) {
    const declaration = match[1];
    const sha = match[2].toLowerCase();
    const existing = matches.get(declaration) ?? [];
    if (!existing.includes(sha)) existing.push(sha);
    matches.set(declaration, existing);
  }
  return matches;
}

function unresolved(uses: string, kind: ActionKind, reason: string): ResolvedAction {
  return {
    uses,
    kind,
    repository: null,
    declaredRef: null,
    declaredImmutable: false,
    executedSha: null,
    resolvedNowSha: null,
    evidence: "unresolved",
    reason,
  };
}

function extractUses(workflowSource: string): Array<{ uses: string; kind: "step" | "workflow" }> {
  const parsed = parseDocument(workflowSource);
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((error) => error.message).join("; "));
  }
  const root = parsed.toJS();
  if (!isRecord(root) || !isRecord(root.jobs)) return [];

  const declarations: Array<{ uses: string; kind: "step" | "workflow" }> = [];
  for (const job of Object.values(root.jobs)) {
    if (!isRecord(job)) continue;
    if (typeof job.uses === "string") declarations.push({ uses: job.uses, kind: "workflow" });
    if (!Array.isArray(job.steps)) continue;
    for (const step of job.steps) {
      if (isRecord(step) && typeof step.uses === "string") declarations.push({ uses: step.uses, kind: "step" });
    }
  }
  return declarations;
}

async function resolveRepositoryAction(
  uses: string,
  repository: string,
  declaredRef: string,
  runtimeActionShas: Map<string, string[]>,
  resolver: RefResolver,
  limitations: Set<string>,
): Promise<ResolvedAction> {
  if (FULL_SHA.test(declaredRef)) {
    try {
      const verifiedSha = await resolver.verifyDeclaredSha(repository, declaredRef);
      if (verifiedSha.toLowerCase() !== declaredRef.toLowerCase()) {
        limitations.add(`Declared SHA verification returned a different commit for ${uses}.`);
      }
    } catch {
      limitations.add(`Declared full SHA for ${uses} could not be verified through the GitHub API.`);
    }
    return {
      uses,
      kind: "repository",
      repository,
      declaredRef,
      declaredImmutable: true,
      executedSha: declaredRef.toLowerCase(),
      resolvedNowSha: null,
      evidence: "declared-full-sha",
    };
  }

  // GitHub logs normally preserve the complete declaration, but an action
  // stored in a repository subdirectory may be logged as `owner/repo@ref`.
  // Both forms identify the same repository revision when their ref matches.
  const runtimeKey = runtimeActionShas.has(uses) ? uses : `${repository}@${declaredRef}`;
  const runtimeShas = runtimeActionShas.get(runtimeKey) ?? [];
  if (runtimeShas.length === 1) {
    return {
      uses,
      kind: "repository",
      repository,
      declaredRef,
      declaredImmutable: false,
      executedSha: runtimeShas[0],
      resolvedNowSha: null,
      evidence: "runtime-log",
    };
  }
  if (runtimeShas.length > 1) {
    return {
      uses,
      kind: "repository",
      repository,
      declaredRef,
      declaredImmutable: false,
      executedSha: null,
      resolvedNowSha: null,
      evidence: "unresolved",
      reason: "ambiguous-runtime-log",
    };
  }

  const otherRuntimeRef = [...runtimeActionShas.keys()].find((entry) => entry.startsWith(`${repository}@`) && entry !== runtimeKey);
  if (otherRuntimeRef) {
    limitations.add(`Runtime log referenced ${otherRuntimeRef}, but the workflow declared ${uses}.`);
  }

  try {
    const resolvedNowSha = await resolver.resolveCurrentRef(repository, declaredRef);
    return {
      uses,
      kind: "repository",
      repository,
      declaredRef,
      declaredImmutable: false,
      executedSha: null,
      resolvedNowSha: resolvedNowSha.toLowerCase(),
      evidence: "github-api-current-ref",
    };
  } catch {
    return {
      uses,
      kind: "repository",
      repository,
      declaredRef,
      declaredImmutable: false,
      executedSha: null,
      resolvedNowSha: null,
      evidence: "unresolved",
      reason: "current-ref-unavailable",
    };
  }
}

async function resolveUses(
  uses: string,
  declarationKind: "step" | "workflow",
  runtimeActionShas: Map<string, string[]>,
  resolver: RefResolver,
  limitations: Set<string>,
): Promise<ResolvedAction> {
  if (uses.includes("${{")) return unresolved(uses, "dynamic", "dynamic-expression");
  if (declarationKind === "workflow") return unresolved(uses, "reusable-workflow", "unsupported-reusable-workflow");
  if (uses.startsWith("./")) return unresolved(uses, "local", "local-action-not-resolved-in-v0.2");
  if (uses.startsWith("docker://")) return unresolved(uses, "docker", "docker-action-not-resolved-in-v0.2");

  // GitHub permits actions in a repository subdirectory, for example
  // `github/codeql-action/init@v4`. Resolve the repository ref while keeping
  // the complete `uses` string for runtime-log matching.
  const match = uses.match(/^([^/\s]+\/[^/\s]+)(?:\/[^@\s]+)?@(.+)$/);
  if (!match) return unresolved(uses, "unknown", "unsupported-uses-syntax");
  return resolveRepositoryAction(uses, match[1], match[2], runtimeActionShas, resolver, limitations);
}

export async function resolveManifest(input: ResolveInput, resolver: RefResolver): Promise<ResolveManifest> {
  const limitations = new Set<string>();
  if (input.runtimeLogsUnavailableReason) limitations.add(`Runtime logs unavailable: ${input.runtimeLogsUnavailableReason}`);

  let declarations: Array<{ uses: string; kind: "step" | "workflow" }>;
  try {
    declarations = extractUses(input.workflowSource);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown YAML parse error";
    limitations.add(`Workflow could not be parsed: ${message}`);
    declarations = [];
  }

  const runtimeActionShas = input.runtimeLogs ? parseRuntimeActionShas(input.runtimeLogs) : new Map<string, string[]>();
  const actions = await Promise.all(declarations.map((item) => resolveUses(item.uses, item.kind, runtimeActionShas, resolver, limitations)));

  return {
    schemaVersion: "1.1",
    workflow: {
      path: workflowPathFromRun(input.inspection.run.path),
      sourceCommitSha: input.inspection.run.head_sha,
      evidence: "workflow-run-api",
    },
    actions,
    limitations: [...limitations],
  };
}
