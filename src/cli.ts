#!/usr/bin/env node
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { formatCompareOutcome } from "./compare-format.js";
import { formatCompareOutcomeMarkdown } from "./compare-markdown.js";
import { formatInspection } from "./format.js";
import { GithubApiError, GithubClient } from "./github.js";
import { toJsonInspection } from "./json.js";
import { formatResolveManifest } from "./resolve-format.js";
import { parseJobUrl } from "./url.js";

const HELP = `RunReplay — inspect and package GitHub Actions evidence

Usage:
  runreplay --version
  runreplay inspect <github-actions-job-url> [--json] [--token <github-token>] [--api-base <api-url>]
  runreplay resolve <github-actions-job-url> [--json] [--token <github-token>] [--api-base <api-url>]
  runreplay compare <failed-job-url> <baseline-job-url> [--json | --format markdown | --md] [--token <github-token>] [--api-base <api-url>]
  runreplay compare <failed-job-url> --baseline last-successful [--json | --format markdown | --md] [--token <github-token>] [--api-base <api-url>]
  runreplay evidence <failed-job-url> [--token <github-token>] [--api-base <api-url>]

Authentication:
  Public repositories work without authentication, subject to GitHub rate limits.
  For private repositories or higher limits, set GITHUB_TOKEN or use --token.
  For GitHub Enterprise Server, pass the job URL plus --api-base https://HOST/api/v3.

Use --version or -v to print the installed version and exit.
Use --json for stable machine-readable output: schema 1.0 for inspect and compare, 1.1 for resolve.
The evidence command always emits the stable machine-readable evidence schema 1.0.
Use --format markdown or --md with compare to print a GitHub-ready evidence block.

This command captures GitHub's available job metadata. It does not claim to
restore a past runner VM, its filesystem, caches, secrets, or service state.`;

const require = createRequire(import.meta.url);

function readPackageVersion(): string {
  const packageJson = require("../package.json") as { version?: unknown };
  if (typeof packageJson.version !== "string") {
    throw new Error("package.json version is missing.");
  }
  return packageJson.version;
}

interface CliArguments {
  command: "inspect" | "resolve" | "compare" | "evidence";
  url: string;
  baselineUrl?: string;
  baseline?: "last-successful";
  token?: string;
  apiBase?: string;
  json: boolean;
  markdown?: true;
}

export function normalizeApiBase(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Expected --api-base to be an absolute HTTPS URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Expected --api-base to use https.");
  }
  if (url.username || url.password) {
    throw new Error("Do not include credentials in --api-base.");
  }
  if (url.search || url.hash) {
    throw new Error("Do not include a query string or fragment in --api-base.");
  }
  return url.toString().replace(/\/$/, "");
}

export function readArguments(args: string[], env: { GITHUB_TOKEN?: string } = process.env): CliArguments {
  if ((args[0] !== "inspect" && args[0] !== "resolve" && args[0] !== "compare" && args[0] !== "evidence") || !args[1]) throw new Error(HELP);
  const command = args[0];
  const url = args[1];
  let token = env.GITHUB_TOKEN;
  let apiBase: string | undefined;
  let json = false;
  let markdown = false;
  let baselineUrl: string | undefined;
  let baseline: "last-successful" | undefined;
  for (let index = 2; index < args.length; index += 1) {
    if (args[index] === "--json") {
      json = true;
    } else if (args[index] === "--token" && args[index + 1]) {
      token = args[index + 1];
      index += 1;
    } else if (args[index] === "--api-base" && args[index + 1]) {
      apiBase = normalizeApiBase(args[index + 1]);
      index += 1;
    } else if (command === "compare" && args[index] === "--baseline" && args[index + 1] === "last-successful") {
      baseline = "last-successful";
      index += 1;
    } else if (command === "compare" && args[index] === "--format" && args[index + 1] === "markdown") {
      markdown = true;
      index += 1;
    } else if (command === "compare" && args[index] === "--md") {
      markdown = true;
    } else if (command === "compare" && !args[index].startsWith("-") && !baselineUrl) {
      baselineUrl = args[index];
    } else {
      throw new Error(`Unknown argument: ${args[index]}\n\n${HELP}`);
    }
  }
  if (command === "compare" && ((baselineUrl && baseline) || (!baselineUrl && !baseline))) {
    throw new Error(`Compare needs either a baseline job URL or --baseline last-successful.\n\n${HELP}`);
  }
  if (json && markdown) {
    throw new Error(`Choose only one compare output format: --json, --format markdown, or --md.\n\n${HELP}`);
  }
  return {
    command,
    url,
    baselineUrl,
    baseline,
    token,
    apiBase,
    json,
    ...(markdown ? { markdown: true as const } : {}),
  };
}

export function redactSensitiveText(value: string, token?: string): string {
  let redacted = value;
  if (token) redacted = redacted.split(token).join("[redacted]");
  return redacted
    .replace(/Authorization:\s*Bearer\s+\S+/gi, "[authorization redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(github_pat_|gh[opsru]_)[A-Za-z0-9_]+/g, "$1[redacted]");
}

export function githubApiFailureHints(error: GithubApiError): string[] {
  const message = error.message.toLowerCase();
  if (error.status === 401) {
    return [
      "Check GITHUB_TOKEN or --token. The token is missing, expired, or invalid for this repository.",
    ];
  }
  if (
    error.status === 429 ||
    (error.status === 403 && (message.includes("rate limit") || message.includes("secondary rate limit")))
  ) {
    return [
      "GitHub API rate limit reached. Set GITHUB_TOKEN or --token for a higher limit, or retry after the limit resets.",
    ];
  }
  if (error.status === 403) {
    return [
      "The token can authenticate, but GitHub refused this request. For private repositories, use a token with read access to Actions and Contents.",
    ];
  }
  if (error.status === 404) {
    return [
      "Check the owner, repository, run ID, and job ID. For private repositories, 404 can also mean the token cannot see the repository or Actions resource.",
    ];
  }
  if (error.status === 410) {
    return [
      "GitHub says this resource is gone. Job logs or artifacts may have expired; RunReplay can only inspect metadata GitHub still retains.",
    ];
  }
  return [];
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args[0] === "--version" || args[0] === "-v") {
    console.log(readPackageVersion());
    return;
  }

  if (args[0] === "--help" || args[0] === "-h" || args.length === 0) {
    console.log(HELP);
    return;
  }

  let tokenForRedaction = process.env.GITHUB_TOKEN;
  try {
    const { command, url, baselineUrl, baseline, token, apiBase, json, markdown } = readArguments(args);
    tokenForRedaction = token;
    const client = new GithubClient(token, apiBase);
    const parseOptions = { allowEnterpriseHost: apiBase !== undefined };
    const reference = parseJobUrl(url, parseOptions);
    if (command === "inspect") {
      const inspection = await client.inspect(reference);
      console.log(json ? JSON.stringify(toJsonInspection(inspection), null, 2) : formatInspection(inspection));
    } else if (command === "resolve") {
      const manifest = await client.resolve(reference);
      console.log(json ? JSON.stringify(manifest, null, 2) : formatResolveManifest(manifest));
    } else if (command === "evidence") {
      console.log(JSON.stringify(await client.evidence(reference), null, 2));
    } else {
      const result = baseline === "last-successful"
        ? await client.compareWithLastSuccessful(reference)
        : await client.compare(reference, parseJobUrl(baselineUrl!, parseOptions));
      console.log(
        json
          ? JSON.stringify(result, null, 2)
          : markdown
            ? formatCompareOutcomeMarkdown(result)
            : formatCompareOutcome(result),
      );
    }
  } catch (error) {
    const message = redactSensitiveText(error instanceof Error ? error.message : "Unknown error", tokenForRedaction);
    console.error(`RunReplay failed: ${message}`);
    if (error instanceof GithubApiError) {
      for (const hint of githubApiFailureHints(error)) {
        console.error(redactSensitiveText(hint, tokenForRedaction));
      }
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
