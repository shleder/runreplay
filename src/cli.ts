#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { formatInspection } from "./format.js";
import { GithubApiError, GithubClient } from "./github.js";
import { toJsonInspection } from "./json.js";
import { formatResolveManifest } from "./resolve-format.js";
import { parseJobUrl } from "./url.js";

const HELP = `RunReplay — inspect a GitHub Actions job

Usage:
  runreplay inspect <github-actions-job-url> [--json] [--token <github-token>]
  runreplay resolve <github-actions-job-url> [--json] [--token <github-token>]

Authentication:
  Public repositories work without authentication, subject to GitHub rate limits.
  For private repositories or higher limits, set GITHUB_TOKEN or use --token.

Use --json for a stable machine-readable schema: 1.0 for inspect, 1.1 for resolve.

This command captures GitHub's available job metadata. It does not claim to
restore a past runner VM, its filesystem, caches, secrets, or service state.`;

function readArguments(args: string[]): { command: "inspect" | "resolve"; url: string; token?: string; json: boolean } {
  if ((args[0] !== "inspect" && args[0] !== "resolve") || !args[1]) throw new Error(HELP);
  const command = args[0];
  const url = args[1];
  let token = process.env.GITHUB_TOKEN;
  let json = false;
  for (let index = 2; index < args.length; index += 1) {
    if (args[index] === "--json") {
      json = true;
    } else if (args[index] === "--token" && args[index + 1]) {
      token = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${args[index]}\n\n${HELP}`);
    }
  }
  return { command, url, token, json };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args[0] === "--help" || args[0] === "-h" || args.length === 0) {
    console.log(HELP);
    return;
  }

  try {
    const { command, url, token, json } = readArguments(args);
    const client = new GithubClient(token);
    const reference = parseJobUrl(url);
    if (command === "inspect") {
      const inspection = await client.inspect(reference);
      console.log(json ? JSON.stringify(toJsonInspection(inspection), null, 2) : formatInspection(inspection));
    } else {
      const manifest = await client.resolve(reference);
      console.log(json ? JSON.stringify(manifest, null, 2) : formatResolveManifest(manifest));
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
