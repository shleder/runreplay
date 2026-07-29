import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { FastModeScheduler, VirtualClock, Watcher, evaluateSubmissionOperation, TaskInput } from './core.js';
import { saveCheckpoint, loadRepositoryProfile, loadCheckpoint } from './checkpoint.js';
import { runBenchmark } from './benchmark.js';

function makeTmpDir() {
  const d = path.join(os.tmpdir(), `fastmode-testing-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
async function driveVirtual(clock: VirtualClock, promises: Promise<any>[]): Promise<void> {
  let settled = false;
  let error: any = null;
  Promise.all(promises).then(
    () => settled = true,
    (err) => {
      settled = true;
      error = err;
    }
  );
  while (!settled) {
    clock.tick(100);
    await new Promise(r => setTimeout(r, 0));
  }
  if (error) {
    throw error;
  }
}

test('concurrency and waiting do not block runnable unrelated track', async () => {
  const base = makeTmpDir();
  const clock = new VirtualClock();
  const sched = new FastModeScheduler(path.join(base, 'db'), path.join(base, 'tmp'), clock);
  sched.concurrencyLimit = 5;

  const promises: Promise<any>[] = [];
  for (let i = 0; i < 5; i++) {
    promises.push(sched.submitTask({
      trackId: `t-${i}`, priority: 'discovery', owner: 'g', repo: 'a', branch: `b-${i}`,
      directive: 'fix', baseCommit: 'base', reproHash: 'repro', lockHash: 'lock', toolchain: 'n-20'
    }));
  }
  // Unrelated runnable task (different branch)
  const ru = sched.submitTask({
    trackId: 'unrelated', priority: 'maintainer', owner: 'g', repo: 'a', branch: 'unrelated-branch',
    directive: 'fix2', baseCommit: 'base', reproHash: 'repro2', lockHash: 'lock', toolchain: 'n-20'
  });
  promises.push(ru);

  let resolved = false;
  Promise.all(promises).then(() => resolved = true);
  while (!resolved) {
    clock.tick(100);
    await new Promise(r => setTimeout(r, 0));
  }
  const cp = loadCheckpoint(path.join(base, 'db'), 'unrelated')!;
  assert.ok(cp.phases.submission.completed);
  fs.rmSync(base, { recursive: true, force: true });
});

test('preemption aborts active matching branch', async () => {
  const base = makeTmpDir();
  const clock = new VirtualClock();
  const sched = new FastModeScheduler(path.join(base, 'db'), path.join(base, 'tmp'), clock);

  const taskPromise = sched.submitTask({
    trackId: 'preempted-task', priority: 'discovery', owner: 'g', repo: 'a', branch: 'feat-victim',
    directive: 'do bad fix', baseCommit: 'base', reproHash: 'repro', lockHash: 'lock', toolchain: 'n-20'
  });

  clock.setTimeout(() => {
    sched.handleWatcherEvent({
      id: 'preempt-ev', type: 'conflict_preemption', payload: { branch: 'feat-victim' }
    });
  }, 500);

  await assert.rejects(driveVirtual(clock, [taskPromise]), /aborted/);
  const subExists = fs.existsSync(path.join(base, 'db', 'tracks', 'preempted-task', 'submission.json'));
  assert.equal(subExists, false);
  fs.rmSync(base, { recursive: true, force: true });
});

test('changes_requested durably reopens track and enqueues at high priority', async () => {
  const base = makeTmpDir();
  const clock = new VirtualClock();
  const sched = new FastModeScheduler(path.join(base, 'db'), path.join(base, 'tmp'), clock);
  const t: TaskInput = { trackId: 't-watch-reopen', priority: 'discovery', owner: 'o', repo: 'r', branch: 'b', directive: 'dir', baseCommit: 'b', reproHash: 'h', lockHash: 'l', toolchain: 'n' };

  await driveVirtual(clock, [sched.submitTask(t)]);
  sched.handleWatcherEvent({
    id: 'changes-ev', type: 'changes_requested', payload: { trackId: 't-watch-reopen' }
  });
  const cp = loadCheckpoint(path.join(base, 'db'), 't-watch-reopen')!;
  assert.equal(cp.priority, 'maintainer');
  assert.equal(cp.phases.submission.completed, false);
  fs.rmSync(base, { recursive: true, force: true });
});

test('warm pool reuse and lock/toolchain invalidation', async () => {
  const base = makeTmpDir();
  const clock = new VirtualClock();
  const sched = new FastModeScheduler(path.join(base, 'db'), path.join(base, 'tmp'), clock);
  const t1 = sched.submitTask({ trackId: 't1', priority: 'discovery', owner: 'o', repo: 'r', branch: 'b1', directive: 'd', baseCommit: 'b', reproHash: 'h', lockHash: 'l1', toolchain: 'n-20' });
  await driveVirtual(clock, [t1]);
  assert.equal(sched.telemetry.misses, 1);

  // Same components -> hits
  const t2 = sched.submitTask({ trackId: 't2', priority: 'discovery', owner: 'o', repo: 'r', branch: 'b2', directive: 'd', baseCommit: 'b', reproHash: 'h', lockHash: 'l1', toolchain: 'n-20' });
  await driveVirtual(clock, [t2]);
  assert.equal(sched.telemetry.hits, 1);

  // Changed lock/toolchain component -> invalidates
  const t3 = sched.submitTask({ trackId: 't3', priority: 'discovery', owner: 'o', repo: 'r', branch: 'b3', directive: 'd', baseCommit: 'b', reproHash: 'h', lockHash: 'l2', toolchain: 'n-22' });
  await driveVirtual(clock, [t3]);
  assert.equal(sched.telemetry.misses, 2);
  fs.rmSync(base, { recursive: true, force: true });
});

test('exact renderCompact review phase mapping', () => {
  const base = makeTmpDir();
  const clock = new VirtualClock();
  const sched = new FastModeScheduler(path.join(base, 'db'), path.join(base, 'tmp'), clock);
  const cp = {
    trackId: 'tx', priority: 'discovery' as const, branchKey: 'b',
    identity: {
      issueId: '',
      base: '',
      reproduction: {
        command: '',
        result: '',
        artifactHash: ''
      },
      directiveHash: '',
      authorHash: '',
      appliedHashes: [],
      reviewHash: '',
      validationHash: '',
      branch: '',
      commitSha: '',
      pr: null,
      cursor: null
    },
    phases: { discovery: { completed: true }, repro: { completed: true }, author: { completed: true, route: 'gemini' as const }, review: { completed: false }, validation: { completed: false, focused: false }, submission: { completed: false } },
    events: []
  };
  const str = sched.renderCompact(cp, 'active', 'test-next', 'none', '/cp.json');
  assert.ok(str.includes('PHASE:review'));
  fs.rmSync(base, { recursive: true, force: true });
});

test('speculation author blocked before directive changed', async () => {
  const base = makeTmpDir();
  const clock = new VirtualClock();
  const sched = new FastModeScheduler(path.join(base, 'db'), path.join(base, 'tmp'), clock);
  const input = { trackId: 't', priority: 'discovery' as const, owner: 'o', repo: 'r', branch: 'b', directive: 'dir', baseCommit: 'b', reproHash: 'h', lockHash: 'l', toolchain: 'n' };
  clock.setTimeout(() => {
    input.directive = 'changed-dir';
  }, 500);
  await assert.rejects(driveVirtual(clock, [sched.submitTask(input)]), /changed during authorship/);
  fs.rmSync(base, { recursive: true, force: true });
});

test('benchmark terminated and yields speedup', async () => {
  const base = makeTmpDir();
  const res = await runBenchmark(base);
  assert.ok(res.speedup >= 1.0);
  assert.ok(res.kimiRuns >= 1);
  fs.rmSync(base, { recursive: true, force: true });
});
