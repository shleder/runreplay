import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { FastModeScheduler, VirtualClock, TaskInput } from './core.js';
import { saveCheckpoint } from './checkpoint.js';

const tracks: TaskInput[] = [
  { trackId: 'retry-track', priority: 'reproduced', owner: 'google', repo: 'antigravity', branch: 'feat-retry', directive: 'Fix memory leaks', baseCommit: 'base-1', reproHash: 'repro-1', lockHash: 'lock-1', toolchain: 'n-20' },
  { trackId: 'quota-track', priority: 'discovery', owner: 'google', repo: 'antigravity', branch: 'feat-quota', directive: 'Optimize queries', baseCommit: 'base-1', reproHash: 'repro-1', lockHash: 'lock-1', toolchain: 'n-20', geminiFailKind: 'quota-exhausted' },
  { trackId: 'long-track', priority: 'ready-submit', owner: 'google', repo: 'antigravity', branch: 'feat-long', directive: 'Integrate workspace', baseCommit: 'base-2', reproHash: 'repro-2', lockHash: 'lock-2', toolchain: 'n-22', longTest: true },
  { trackId: 'preempt-track', priority: 'maintainer', owner: 'google', repo: 'antigravity', branch: 'feat-lock', directive: 'Security emergency hotfix', baseCommit: 'base-3', reproHash: 'repro-3', lockHash: 'lock-3', toolchain: 'n-20' },
  { trackId: 'ready-submit-track', priority: 'ready-submit', owner: 'google', repo: 'antigravity', branch: 'feat-lock', directive: 'Refactor core types data structure', baseCommit: 'base-3', reproHash: 'repro-3', lockHash: 'lock-3', toolchain: 'n-20' }
];

function deepCloneTracks(): TaskInput[] {
  return JSON.parse(JSON.stringify(tracks));
}

export async function runBenchmark(base: string) {
  const normalDb = path.join(base, 'normal-db');
  const normalTmp = path.join(base, 'normal-tmp');
  const fastDb = path.join(base, 'fast-db');
  const fastTmp = path.join(base, 'fast-tmp');

  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(base, { recursive: true });

  // NORMAL Mode
  const clockN = new VirtualClock();
  const schedN = new FastModeScheduler(normalDb, normalTmp, clockN, {
    cache: false, checkpoint: false, deltaReview: false, focusedVal: false, fallback: false
  });
  schedN.concurrencyLimit = 1;
  const inputsN = deepCloneTracks();
  const promisesN = inputsN.map(t => schedN.submitTask(t));
  let resolvedN = false;
  Promise.all(promisesN).then(() => resolvedN = true);
  while (!resolvedN) {
    clockN.tick(100);
    await new Promise(r => setTimeout(r, 0));
  }
  const wallN = clockN.now();

  // FAST Mode
  const clockF = new VirtualClock();
  const schedF = new FastModeScheduler(fastDb, fastTmp, clockF, {
    cache: true, checkpoint: true, deltaReview: true, focusedVal: true, fallback: true
  });
  schedF.concurrencyLimit = 5;

  const inputsF = deepCloneTracks();
  const testLong = inputsF.find(t => t.trackId === 'long-track')!;
  saveCheckpoint(fastDb, testLong.trackId, {
    trackId: testLong.trackId, priority: testLong.priority, branchKey: `${testLong.owner}/${testLong.repo}/${testLong.branch}`,
    identity: {
      issueId: 'issue-long', base: testLong.baseCommit, reproduction: { command: 'repro', result: 'hash', artifactHash: testLong.reproHash }, directiveHash: createHash('sha256').update(testLong.directive).digest('hex'), authorHash: '', appliedHashes: [], reviewHash: '', validationHash: '', branch: testLong.branch, commitSha: testLong.baseCommit, pr: null, cursor: null
    },
    phases: { discovery: { completed: true }, repro: { completed: true }, author: { completed: false, route: 'gemini' }, review: { completed: false }, validation: { completed: false, focused: false }, submission: { completed: false } },
    events: []
  });

  const promisesF = inputsF.map(t => schedF.submitTask(t));
  let resolvedF = false;
  Promise.all(promisesF).then(() => resolvedF = true);
  while (!resolvedF) {
    clockF.tick(100);
    await new Promise(r => setTimeout(r, 0));
  }
  const wallF = clockF.now();
  const telF = schedF.telemetry;
  return {
    speedup: wallF > 0 ? (wallN / wallF) : 1,
    normalWall: wallN, fastWall: wallF, workAvoided: telF.workAvoided,
    cacheRate: (telF.hits + telF.misses) > 0 ? telF.hits / (telF.hits + telF.misses) : 0,
    hits: telF.hits, misses: telF.misses, kimiRuns: telF.kimiRuns
  };
}
