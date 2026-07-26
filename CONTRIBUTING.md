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

## Pull request expectations

- Explain the user-facing change and its limits.
- Avoid logging tokens, authorization headers, or private repository contents.
- Preserve the project’s core promise: state only what GitHub data proves.
- Update the README or roadmap when behavior or scope changes.
- Use conventional, descriptive commit messages where practical.

## Good first contributions

- JSON output for `inspect`.
- Unit tests with recorded API fixtures.
- Clearer error messages for GitHub API permissions and rate limits.
- GitHub Enterprise Server URL parsing.
- Artifact metadata improvements.
- Documentation examples for public and private repositories.

## Reporting security issues

Do not open a public issue for a suspected vulnerability. See [SECURITY.md](SECURITY.md).
