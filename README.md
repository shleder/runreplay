# RunReplay

**Turn a failed GitHub Actions job URL into a factual debugging record.**

AI can suggest a CI fix from a log. Maintainers still need the exact commit, job configuration, runner labels, failed step, and artifacts before they can judge or reproduce that fix. RunReplay collects those facts in one command.

```bash
runreplay inspect https://github.com/OWNER/REPO/actions/runs/RUN_ID/job/JOB_ID
```

Example output:

```text
RunReplay inspection

Repository:       acme/widgets
Workflow run:     CI (#123)
Job:              test (456)
Conclusion:       failure (completed)
Commit SHA:       8e1f…
Runner labels:    ubuntu-latest, X64

Steps:
  1. [success] Set up job
  2. [failure] Run tests

Artifacts (1):
  - test-results (4821 bytes; available)
```

## What the MVP does

- parses a GitHub Actions **job URL**;
- fetches the job, workflow run, and workflow artifacts through the GitHub API;
- reports the commit SHA, workflow event, branch, runner labels, job conclusion, timestamps, and every returned step;
- prints authenticated API URLs for the job logs and artifact downloads.

## What it does not do

RunReplay **does not currently restore a past runner VM**. It cannot recover the vanished filesystem, caches, secrets, service-container state, or files that GitHub did not preserve as artifacts. The project deliberately does not claim exact job replay until that capability is implemented and independently verified.

## Install and run

Requirements: Node.js 20 or later.

```bash
npm install
npm run build
node dist/cli.js inspect https://github.com/OWNER/REPO/actions/runs/RUN_ID/job/JOB_ID
```

For scripts, Claude integrations, `jq`, and CI bots, request the stable JSON schema:

```bash
node dist/cli.js inspect https://github.com/OWNER/REPO/actions/runs/RUN_ID/job/JOB_ID --json > inspection.json
```

```json
{
  "schemaVersion": "1.0",
  "repository": "actions/checkout",
  "runId": 123,
  "jobId": 456,
  "commitSha": "…",
  "event": "push",
  "runner": { "labels": ["ubuntu-latest"] },
  "steps": [],
  "artifacts": [],
  "redactions": []
}
```

For private repositories (and to avoid low anonymous API limits), provide a fine-grained token with read access to **Actions** and **Contents**:

```bash
GITHUB_TOKEN=github_pat_... node dist/cli.js inspect https://github.com/OWNER/REPO/actions/runs/RUN_ID/job/JOB_ID
```

You may also use `--token <token>`. Do not paste a token into an issue, shell history you share, or a CI log. The `runreplay` global command will be available after the package is published to npm.

## Development

```bash
npm install
npm test
npm run check
npm run build
node dist/cli.js --help
```

The test command names the compiled test files explicitly so it behaves the same in Windows shells and Node 20 on GitHub Actions.

## Architecture

```text
CLI
 ├─ URL parser              validates and extracts owner, repo, run, job
 ├─ GitHub API client       fetches job + run + artifacts
 ├─ Inspection formatter    produces a human-readable factual report
 └─ Replay pipeline (future)
     ├─ workflow resolver
     ├─ environment manifest
     ├─ artifact importer
     ├─ replay backend
     └─ verification report
```

The boundary is intentional: future replay backends consume an `Inspection` rather than making the CLI, GitHub API, and sandbox implementation one inseparable module. The JSON exporter converts that internal inspection into a versioned public schema.

## Roadmap

See [ROADMAP.md](ROADMAP.md). The highest-value next work is explicit environment capture and a local, clearly-labelled **best-effort** replay path—not unverified claims of perfect VM restoration.

## Contributing

Useful contributions include GitHub Enterprise Server URL support, JSON output, API fixtures, command-line UX, documentation, and the environment-manifest design. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

Apache-2.0. See [LICENSE](LICENSE).
