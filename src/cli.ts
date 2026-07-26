#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { formatInspection } from "./format.js";
import { GithubApiError, GithubClient } from "./github.js";
import { toJsonInspection } from "./json.js";
import { parseJobUrl } from "./url.js";

const HELP = `RunReplay — inspect a GitHub Actions job

Usage:
  runreplay inspect <github-actions-job-url> [--json] [--token <github-token>]

Authentication:
  Public repositories work without authentication, subject to GitHub rate limits.
  For private repositories or higher limits, set GITHUB_TOKEN or use --token.

Use --json for the stable machine-readable schema (version 1.0).

This command captures GitHub's available job metadata. It does not claim to
restore a past runner VM, its filesystem, caches, secrets, or service state.`;

function readArguments(args: string[]): { url: string; token?: string; json: boolean } {
  if (args[0] !== "inspect" || !args[1]) throw new Error(HELP);
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
  return { url, token, json };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args[0] === "--help" || args[0] === "-h" || args.length === 0) {
    console.log(HELP);
    return;
  }

  try {
    const { url, token, json } = readArguments(args);
    const inspection = await new GithubClient(token).inspect(parseJobUrl(url));
    console.log(json ? JSON.stringify(toJsonInspection(inspection), null, 2) : formatInspection(inspection));
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
