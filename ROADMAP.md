# RunReplay roadmap

## v0.1 — inspection MVP

- [x] Parse standard GitHub Actions job URLs.
- [x] Fetch job, workflow run, and artifact metadata.
- [x] Display commit SHA, runner labels, steps, conclusion, log API URL, and artifacts.
- [x] Support `GITHUB_TOKEN` for private repositories.
- [x] Unit tests and continuous integration.

## v0.2 — resolve manifest

- [x] Add `--json` with the documented `1.0` schema for scripts and integrations.
- [x] Fetch the workflow source at the historical run's `head_sha`.
- [x] Parse supported `uses:` declarations from workflow jobs and steps.
- [x] Extract executed Action SHAs from GitHub Runner logs when they are available.
- [x] Label all Action resolution with explicit evidence instead of treating current tags as historical truth.
- [x] Report unsupported local, Docker, dynamic, and reusable workflow declarations honestly.
- [ ] Add API response fixtures and integration-test opt-in mode.
- [ ] Explain API permission, rate-limit, and expired-artifact failures.
- [ ] Support GitHub Enterprise Server hosts.
- [ ] Export a versioned, redacted inspection manifest.

## v0.3 — best-effort local preparation

- [ ] Capture visible runner-image and matrix evidence when GitHub exposes it.
- [ ] Generate a local reproduction checklist and container setup proposal.
- [ ] Import available artifacts on explicit user request.
- [ ] Label every result with an evidence level; do not call it an exact replay.

## v1.0 — validated replay experiments

- [ ] Define an evidence model for source, workflow, action, runner, artifact, and service parity.
- [ ] Build pluggable replay backends.
- [ ] Compare local output with the original job using explicit verification rules.
- [ ] Publish limitations and a compatibility matrix before claiming reproducibility.

## Not planned

RunReplay will not extract secrets or recover data from a completed GitHub-hosted VM that GitHub did not retain. A tool that claims otherwise is misleading.
