#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { formatCompareOutcome } from "./compare-format.js";
import { formatInspection } from "./format.js";
import { GithubApiError, GithubClient } from "./github.js";
import { toJsonInspection } from "./json.js";
import { formatResolveManifest } from "./resolve-format.js";
import { parseJobUrl } from "./url.js";

const HELP = `RunReplay — inspect a GitHub Actions job

Usage:
  runreplay inspect <github-actions-job-url> [--json] [--token <github-token>] [--api-base <api-url>]
  runreplay resolve <github-actions-job-url> [--json] [--token <github-token>] [--api-base <api-url>]
  runreplay compare <failed-job-url> <baseline-job-url> [--json] [--token <github-token>] [--api-base <api-url>]
  runreplay compare <failed-job-url> --baseline last-successful [--json] [--token <github-token>] [--api-base <api-url>]

Authentication:
  Public repositories work without authentication, subject to GitHub rate limits.
  For private repositories or higher limits, set GITHUB_TOKEN or use --token.
  For GitHub Enterprise Server, pass the job URL plus --api-base https://HOST/api/v3.

Use --json for a stable machine-readable schema: 1.0 for inspect and compare, 1.1 for resolve.

This command captures GitHub's available job metadata. It does not claim to
restore a past runner VM, its filesystem, caches, secrets, or service state.`;

interface CliArguments {
  command: "inspect" | "resolve" | "compare";
  url: string;
  baselineUrl?: string;
  baseline?: "last-successful";
  token?: string;
  apiBase?: string;
  json: boolean;
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
  if ((args[0] !== "inspect" && args[0] !== "resolve" && args[0] !== "compare") || !args[1]) throw new Error(HELP);
  const command = args[0];
  const url = args[1];
  let token = env.GITHUB_TOKEN;
  let apiBase: string | undefined;
  let json = false;
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
    } else if (command === "compare" && !args[index].startsWith("-") && !baselineUrl) {
      baselineUrl = args[index];
    } else {
      throw new Error(`Unknown argument: ${args[index]}\n\n${HELP}`);
    }
  }
  if (command === "compare" && ((baselineUrl && baseline) || (!baselineUrl && !baseline))) {
    throw new Error(`Compare needs either a baseline job URL or --baseline last-successful.\n\n${HELP}`);
  }
  return { command, url, baselineUrl, baseline, token, apiBase, json };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args[0] === "--help" || args[0] === "-h" || args.length === 0) {
    console.log(HELP);
    return;
  }

  try {
    const { command, url, baselineUrl, baseline, token, apiBase, json } = readArguments(args);
    const client = new GithubClient(token, apiBase);
    const parseOptions = { allowEnterpriseHost: apiBase !== undefined };
    const reference = parseJobUrl(url, parseOptions);
    if (command === "inspect") {
      const inspection = await client.inspect(reference);
      console.log(json ? JSON.stringify(toJsonInspection(inspection), null, 2) : formatInspection(inspection));
    } else if (command === "resolve") {
      const manifest = await client.resolve(reference);
      console.log(json ? JSON.stringify(manifest, null, 2) : formatResolveManifest(manifest));
    } else {
      const result = baseline === "last-successful"
        ? await client.compareWithLastSuccessful(reference)
        : await client.compare(reference, parseJobUrl(baselineUrl!, parseOptions));
      console.log(json ? JSON.stringify(result, null, 2) : formatCompareOutcome(result));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`RunReplay failed: ${message}`);
    if (error instanceof GithubApiError && error.status === 401) {
      console.error("Supply a valid GITHUB_TOKEN for this repository.");
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
