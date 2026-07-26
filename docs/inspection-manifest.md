# Redacted inspection manifest proposal

## Goal

Add a shareable inspection manifest that can be attached to an issue, pasted into
another tool, or stored beside a CI investigation without exposing credentials,
private download URLs, or data that GitHub did not return.

The manifest is a design target for a future export command. It does not add
secret discovery, log scanning, artifact extraction, or recovery of data from a
completed runner.

## Proposed schema

Use a schema name and version that are independent from both the CLI version and
the existing `inspect --json` schema:

```json
{
  "schema": "runreplay.inspection-manifest",
  "schemaVersion": "0.1",
  "generatedAt": "2026-01-15T12:34:56.000Z",
  "generatedBy": {
    "name": "runreplay",
    "version": "0.3.0"
  },
  "source": {
    "kind": "github-actions-job",
    "url": "https://github.com/actions/checkout/actions/runs/123/jobs/456",
    "repository": "actions/checkout",
    "runId": 123,
    "jobId": 456,
    "visibility": "public"
  },
  "inspection": {
    "commitSha": "3f4c2d1b8a0e7f6d5c4b3a291817161514131211",
    "event": "push",
    "workflow": {
      "path": ".github/workflows/ci.yml",
      "sourceCommitSha": "3f4c2d1b8a0e7f6d5c4b3a291817161514131211",
      "evidence": "workflow-run-api"
    },
    "job": {
      "name": "test",
      "status": "completed",
      "conclusion": "failure",
      "startedAt": "2026-01-15T12:00:00Z",
      "completedAt": "2026-01-15T12:05:00Z",
      "runnerLabels": ["ubuntu-latest"]
    },
    "steps": [
      {
        "number": 1,
        "name": "Run tests",
        "status": "completed",
        "conclusion": "failure",
        "startedAt": "2026-01-15T12:01:00Z",
        "completedAt": "2026-01-15T12:05:00Z"
      }
    ],
    "artifacts": [
      {
        "id": 789,
        "name": "test-results",
        "sizeInBytes": 2048,
        "availability": "available",
        "expiresAt": "2026-04-15T12:05:00Z",
        "references": [
          {
            "kind": "archive-download-url",
            "value": "[redacted:r1]",
            "redactionId": "r1"
          }
        ]
      }
    ]
  },
  "redactions": [
    {
      "id": "r1",
      "pointer": "/inspection/artifacts/0/references/0/value",
      "kind": "short-lived-private-reference",
      "reason": "Artifact archive URLs can require repository permissions and may expire.",
      "replacement": "[redacted:r1]"
    }
  ],
  "limitations": [
    "The manifest contains only metadata returned by GitHub APIs.",
    "RunReplay did not inspect artifact contents, caches, service containers, runner filesystem state, or secrets."
  ]
}
```

## Safe-by-default fields

The default export should include factual metadata that is already present in
RunReplay inspection or resolve output:

- schema identity, schema version, generation timestamp, and RunReplay version
- source kind, repository, run id, job id, job URL, and declared visibility
- commit SHA, event, workflow path, workflow source commit SHA, and evidence
- job name, status, conclusion, timestamps, and runner labels
- step number, name, status, conclusion, and timestamps
- artifact id, name, size, availability, and expiry timestamp
- limitations that explain unavailable data and unsupported recovery claims

The default export should not include:

- GitHub tokens, authorization headers, cookies, or environment variables
- job logs or arbitrary log excerpts
- artifact contents or filenames inside archives
- workflow source text unless a later schema explicitly adds it with separate
  redaction rules
- private or short-lived API references in plain text

For public repositories, repository name and commit SHA are generally useful
evidence. For private repositories or sensitive investigations, a future command
can add an explicit option to redact repository identity and replace it with a
stable placeholder. That option should record structured redactions instead of
silently dropping fields.

## Redaction records

Every redaction should have a corresponding entry in `redactions`:

- `id`: stable identifier referenced from the redacted field
- `pointer`: JSON Pointer to the field that was replaced
- `kind`: machine-readable reason category
- `reason`: human-readable explanation
- `replacement`: the exact replacement value written into the manifest

The redaction record must not include the original value. If correlation is
needed later, add an opt-in hash field with a documented salt strategy instead
of storing raw secrets or private URLs.

Suggested `kind` values for the first schema:

- `credential`: token, cookie, authorization header, or credential-bearing URL
- `private-repository`: owner, repository, branch, URL, or workflow path hidden
  by an explicit private sharing mode
- `short-lived-private-reference`: GitHub API URLs for logs or artifact archives
  that require authorization, expire, or disclose private repository context
- `unsupported-field`: a field intentionally omitted because RunReplay cannot
  prove it from retained GitHub data

## Versioning

`schemaVersion` belongs to the manifest schema, not the CLI. The CLI can emit the
same manifest schema across multiple RunReplay releases.

Use semantic compatibility rules:

- additive optional fields can increment the minor version, for example `0.2`
- removing fields, changing field meanings, or changing required field types
  requires a major version, for example `1.0`
- consumers should reject unknown major versions and tolerate unknown optional
  fields within a known major version

Keep `generatedBy.version` for diagnostics only. Consumers should branch on
`schema` and `schemaVersion`, not on the RunReplay package version.

## Artifact references

Artifact references need stricter treatment than ordinary metadata:

- `archive_download_url` may require repository permissions and can expire
- logs API URLs can point to private repositories and short-lived archives
- artifact names are user controlled and might contain sensitive context
- artifact contents are outside the inspection API response and must not be
  implied as available

The first manifest schema should include artifact metadata and availability, but
store direct archive/log references as redacted reference objects by default. A
future command can add an explicit `--include-private-references` mode for local
automation, but that mode should be unsuitable for public issue attachments and
should be clearly labeled in the manifest.

## Test plan

Implementation should be covered by deterministic tests only:

- fixture-based unit tests that convert an `Inspection` and optional
  `ResolveManifest` into the example schema
- tests that artifact archive URLs and logs API URLs are redacted by default
- tests that redaction entries use valid JSON Pointers and never include the
  original secret or private URL
- tests that public metadata stays stable when redactions are present
- tests for an explicit private-sharing mode that redacts repository, branch,
  workflow path, and URLs while preserving run/job ids when requested
- tests for schema-version stability so additive fields do not accidentally
  change existing field meanings
- a snapshot or fixture test for the documentation example, with deterministic
  `generatedAt` and `generatedBy.version` inputs

Live GitHub API calls and real tokens are not required for this feature. If a
future integration test is useful, keep it opt-in and assert only that the same
redaction rules apply to live API shapes.
