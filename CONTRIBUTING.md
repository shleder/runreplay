# Contributing to RunReplay

Thanks for helping make CI failures easier to understand and reproduce.

## Before you start

1. Search existing issues and pull requests.
2. For a feature larger than a small bug fix, open an issue first and describe the user problem.
3. Keep each pull request focused on one change.

## Local checks

```bash
npm install
npm test
npm run check
```

Please add or update tests for changed behavior. Tests must not require a real GitHub token or make live GitHub API calls.

### Fixture-based tests (default)

`npm test` runs against an in-memory fixture table in `src/fixtures.ts`, routed
by `src/fixture-client.ts`. These tests are deterministic and never open a
socket. Add new GitHub API shapes there as `FixtureRoute` entries, layer the
relevant fixture sets into `createFixtureFetch(...)`, and assert against the
real `GithubClient`. There is also a test that fails loudly if the router
receives an unrouted URL, so a fixture gap can never silently become a live
call.

### Live integration tests (opt-in)

Tests against the real GitHub REST API live in `src/live.test.ts` and run only
when both are set:

```bash
RUNREPLAY_INTEGRATION=1 RUNREPLAY_LIVE_JOB_URL=https://github.com/owner/repo/actions/runs/1/job/2 npm run test:integration
```

They are skipped by default and never run under `npm test`. They target a
public job, cost real API budget, and honour `GITHUB_TOKEN` for higher rate
limits. A failure there means GitHub changed shape, the run aged out, or
RunReplay regressed — never a flake to ignore.

## Pull request expectations

- Explain the user-facing change and its limits.
- Avoid logging tokens, authorization headers, or private repository contents.
- Preserve the project’s core promise: state only what GitHub data proves.
- Update the README or roadmap when behavior or scope changes.
- Use conventional, descriptive commit messages where practical.

## Good first contributions

- Unit tests with recorded API fixtures.
- Clearer error messages for GitHub API permissions and rate limits.
- GitHub Enterprise Server URL parsing.
- Artifact metadata improvements.
- Documentation examples for public and private repositories.

## Reporting security issues

Do not open a public issue for a suspected vulnerability. See [SECURITY.md](SECURITY.md).
