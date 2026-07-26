# johnzastrow/actalog — timezone-dependent frontend test

## Failed job

[Web: test — run 29711317401](https://github.com/johnzastrow/actalog/actions/runs/29711317401/job/88255549303)

## RunReplay evidence

RunReplay compared the failing main job with the last successful main job:

- baseline: [run 29699700709](https://github.com/johnzastrow/actalog/actions/runs/29699700709/job/88226532165), commit `8d614b2`, success;
- failed: run `29711317401`, commit `0b3b6f8`, failure;
- workflow source, Action revisions, and runner labels did not change;
- one repository commit changed four files, including `web/src/views/LogWorkoutView.vue`;
- the changed step was `Run frontend tests`.

## Root cause

`LogWorkoutView` calculates its default date with the configured user timezone, which defaults to `America/New_York`. Its test constructed the expected date in the GitHub runner's local timezone. Near the UTC date boundary, the values differ by one day.

## Fix

[External PR #283](https://github.com/johnzastrow/actalog/pull/283) changes the test to use `getTodayInTimezone('America/New_York')`, the same helper and default timezone used by the component.

Local validation: `npm run test:run -- src/views/LogWorkoutView.test.js` — 43 tests passed.

## Result

Waiting for upstream review.
