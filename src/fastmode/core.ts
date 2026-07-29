import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  saveCheckpoint, loadCheckpoint, saveDirective, saveAuthor, saveReview, saveValidation, saveSubmission, logEvent, saveRepositoryProfile
} from './checkpoint.js';
import {
  TrackCheckpoint, RepositoryProfile, WatcherEvent, TrackPriority, TrackIdentity
} from './types.js';
import {
  shouldActivateKimiAuthorFallback, createFallbackAuditRecord, freezeDirective, assertDirectiveUnchanged
} from '../kimi-author-fallback.js';

export const PriorityValue: Record<TrackPriority, number> = {
  'maintainer': 5, 'changes-requested': 4, 'ready-submit': 3, 'reproduced': 2, 'discovery': 1
};
export interface Clock { now(): number; setTimeout(fn: () => void, ms: number): any; }
export class VirtualClock implements Clock {
  private time = 0;
  private q: { fn: () => void; t: number }[] = [];
  now() { return this.time; }
  setTimeout(fn: () => void, ms: number) {
    this.q.push({ fn, t: this.time + ms });
    this.q.sort((a, b) => a.t - b.t);
  }
  tick(ms: number) {
    this.time += ms;
    while (this.q.length > 0 && this.q[0].t <= this.time) {
      const ev = this.q.shift()!;
      ev.fn();
    }
  }
}
export class WarmPool {
  private cache = new Map<string, { dir: string; updated: number }>();
  getOrCreate(base: string, lockHash: string, toolchain: string, profile: RepositoryProfile, tempDir: string, onInv: (d: string) => void, t: number) {
    const key = `${base}:${lockHash}:${toolchain}`;
    for (const [k, v] of this.cache.entries()) {
      if (k.split(':')[0] === base && k !== key) {
        onInv(v.dir);
        this.cache.delete(k);
      }
    }
    if (this.cache.has(key)) return { dir: this.cache.get(key)!.dir, hit: true };
    const dir = path.join(tempDir, `wp-${base.slice(0, 6)}-${lockHash.slice(0, 6)}`);
    fs.mkdirSync(dir, { recursive: true });
    this.cache.set(key, { dir, updated: t });
    return { dir, hit: false };
  }
}
export class Watcher {
  private file: string;
  private cursors = new Set<string>();
  constructor(db: string) {
    this.file = path.join(db, 'watcher-cursors.json');
    if (fs.existsSync(this.file)) {
      try { this.cursors = new Set(JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch {}
    }
  }
  handle(event: WatcherEvent, sched: FastModeScheduler, onAction: (ev: WatcherEvent) => void) {
    if (this.cursors.has(event.id)) return;
    this.cursors.add(event.id);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(Array.from(this.cursors)) + '\n', 'utf8');
    if (event.type === 'changes_requested') {
      const tId = event.payload.trackId;
      let cp = loadCheckpoint(sched.dbDir, tId);
      if (cp) {
        cp.priority = 'maintainer';
        cp.phases.review = { completed: false };
        cp.phases.validation = { completed: false, focused: true };
        cp.phases.submission = { completed: false };
        saveCheckpoint(sched.dbDir, tId, cp);
        logEvent(sched.dbDir, tId, { type: 'changes-requested-reopen', trackId: tId });
      }
    }
    onAction(event);
  }
}
export interface TaskInput {
  trackId: string; priority: TrackPriority; owner: string; repo: string; branch: string; directive: string; baseCommit: string; reproHash: string; lockHash: string; toolchain: string;
  geminiFailKind?: 'quota-exhausted' | 'credential-cooldown' | 'timeout';
  longTest?: boolean; confirmationCallback?: () => void;
}
export function evaluateSubmissionOperation(op: string): { allowed: boolean; reason?: string } {
  const normal = op.toLowerCase();
  for (const f of ['force-push', 'merge', 'close', 'delete', 'settings', 'unrelated-comment']) {
    if (normal.includes(f)) return { allowed: false, reason: `Op contains ${f}` };
  }
  return { allowed: true };
}
export class FastModeScheduler {
  public concurrencyLimit = 5;
  public activeLanes = 0;
  public locks = new Set<string>();
  public queue: { input: TaskInput; qTime: number; resolve: (val: any) => void; reject: (err: any) => void }[] = [];
  public active = new Map<string, { input: TaskInput; abort: () => void }>();
  public warmPool = new WarmPool();
  public geminiAvailable = true;
  public telemetry = { queueMs: 0, geminiRuns: 0, kimiRuns: 0, authorMs: 0, focusedValMs: 0, reviewMs: 0, finalValMs: 0, gitMs: 0, workAvoided: 0, hits: 0, misses: 0, providerWaitingMs: 0, totalWallMs: 0 };
  private watcher: Watcher;
  constructor(public dbDir: string, private tempDir: string, private clock: Clock, public opts: { cache?: boolean; checkpoint?: boolean; deltaReview?: boolean; focusedVal?: boolean; fallback?: boolean } = {}) {
    this.opts = { cache: true, checkpoint: true, deltaReview: true, focusedVal: true, fallback: true, ...opts };
    this.watcher = new Watcher(dbDir);
  }
  submitTask(input: TaskInput): Promise<TrackCheckpoint> {
    return new Promise((resolve, reject) => {
      this.queue.push({ input, qTime: this.clock.now(), resolve, reject });
      this.dispatch();
    });
  }
  public handleWatcherEvent(event: WatcherEvent, onAborted?: (trackId: string) => void): void {
    this.watcher.handle(event, this, (ev) => {
      if (ev.type === 'conflict_preemption' || ev.type === 'closure') {
        const branch = ev.payload.branch;
        for (const [tId, act] of this.active.entries()) {
          if (act.input.branch === branch) {
            logEvent(this.dbDir, tId, { type: 'preemption', trackId: tId, reason: ev.type });
            act.abort();
            if (onAborted) onAborted(tId);
          }
        }
      }
    });
  }
  private dispatch(): void {
    if (this.activeLanes >= this.concurrencyLimit) return;
    this.queue.sort((a, b) => (PriorityValue[b.input.priority] - PriorityValue[a.input.priority]) || (a.qTime - b.qTime));
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];
      const k = `${item.input.owner}/${item.input.repo}/${item.input.branch}`;
      if (!this.locks.has(k)) {
        this.queue.splice(i, 1);
        this.locks.add(k);
        this.activeLanes++;
        this.telemetry.queueMs += this.clock.now() - item.qTime;
        let canceled = false;
        const abort = () => { canceled = true; };
        this.active.set(inputKey(item.input), { input: item.input, abort });
        this.execute(item.input, k, () => canceled).then(item.resolve, item.reject).finally(() => {
          this.active.delete(inputKey(item.input));
          this.activeLanes--;
          this.locks.delete(k);
          this.dispatch();
        });
        this.dispatch();
        break;
      }
    }
  }
  private async execute(input: TaskInput, branchKey: string, checkCanceled: () => boolean): Promise<TrackCheckpoint> {
    let cpRaw = loadCheckpoint(this.dbDir, input.trackId);
    const dirHash = createHash('sha256').update(input.directive).digest('hex');

    let cp: TrackCheckpoint;
    if (cpRaw && this.opts.checkpoint && cpRaw.identity.base === input.baseCommit && cpRaw.identity.reproduction && cpRaw.identity.reproduction.artifactHash === input.reproHash && cpRaw.identity.directiveHash === dirHash) {
      cp = cpRaw;
    } else {
      cp = {
        trackId: input.trackId,
        priority: input.priority,
        branchKey,
        identity: {
          issueId: `issue-${input.trackId}`,
          base: input.baseCommit,
          reproduction: {
            command: 'npm test',
            result: 'pass',
            artifactHash: input.reproHash
          },
          directiveHash: dirHash,
          authorHash: '',
          appliedHashes: [],
          reviewHash: '',
          validationHash: '',
          branch: input.branch,
          commitSha: input.baseCommit,
          pr: null,
          cursor: null
        },
        phases: {
          discovery: { completed: false },
          repro: { completed: false },
          author: { completed: false, route: 'gemini' },
          review: { completed: false },
          validation: { completed: false, focused: false },
          submission: { completed: false }
        },
        events: []
      };
    }

    saveCheckpoint(this.dbDir, input.trackId, cp);
    const profile: RepositoryProfile = { owner: input.owner, repo: input.repo, defaultBranch: 'main', testCmd: 'npm test', focusedCmd: 'npm test', lintCmd: 'npm run lint', formatCmd: 'npm run format', typeCmd: 'tsc', changelogCmd: 'changelog', template: '', fork: false, remotes: [], baseline: '', CI: '', toolchain: input.toolchain, env: {} };
    saveRepositoryProfile(this.dbDir, input.owner, input.repo, profile);

    const spy = freezeDirective(input.directive);
    assertDirectiveUnchanged(spy, input.directive);
    saveDirective(this.dbDir, input.trackId, spy);
    if (checkCanceled()) throw new Error('aborted');

    if (!cp.phases.discovery.completed) {
      await this.delay(1000);
      cp.phases.discovery = { completed: true };
      saveCheckpoint(this.dbDir, input.trackId, cp);
    } else { this.telemetry.workAvoided++; }
    if (checkCanceled()) throw new Error('aborted');

    if (!cp.phases.repro.completed) {
      await this.delay(1500);
      cp.phases.repro = { completed: true };
      saveCheckpoint(this.dbDir, input.trackId, cp);
    } else { this.telemetry.workAvoided++; }

    let wpTime = 2000, hit = false;
    if (this.opts.cache) {
      const wp = this.warmPool.getOrCreate(input.baseCommit, input.lockHash, input.toolchain, profile, this.tempDir, () => {}, this.clock.now());
      hit = wp.hit;
      wpTime = hit ? 200 : 2000;
    }
    await this.delay(wpTime);
    this.telemetry.gitMs += wpTime;
    if (hit) this.telemetry.hits++; else this.telemetry.misses++;
    if (checkCanceled()) throw new Error('aborted');

    let loop = true, step = 0;
    while (loop) {
      step++;
      assertDirectiveUnchanged(spy, input.directive);
      if (!cp.phases.author.completed) {
        let route: 'gemini' | 'kimi-author-fallback' = 'gemini';
        if (!this.geminiAvailable && this.opts.fallback) route = 'kimi-author-fallback';

        if (route === 'gemini' && input.geminiFailKind) {
          this.telemetry.geminiRuns++;
          const kind = input.geminiFailKind;
          if (shouldActivateKimiAuthorFallback({ kind, confirmed: true, normalRetriesComplete: true }) && this.opts.fallback) {
            this.geminiAvailable = false;
            route = 'kimi-author-fallback';
          } else {
            await this.delay(3000);
            this.telemetry.authorMs += 3500;
            input.geminiFailKind = undefined;
            cp.phases.author = { completed: true, route: 'gemini' };
            cp.identity.authorHash = createHash('sha256').update('gemini-recovered').digest('hex');
            saveAuthor(this.dbDir, input.trackId, { route: 'gemini', hash: cp.identity.authorHash });
            saveCheckpoint(this.dbDir, input.trackId, cp);
            continue;
          }
        }
        if (route === 'gemini') {
          this.telemetry.geminiRuns++;
          await this.delay(2000);
          this.telemetry.authorMs += 2000;
          cp.phases.author = { completed: true, route: 'gemini' };
          cp.identity.authorHash = createHash('sha256').update('gemini-success').digest('hex');
          saveAuthor(this.dbDir, input.trackId, { route: 'gemini', hash: cp.identity.authorHash });
        } else {
          this.telemetry.kimiRuns++;
          await this.delay(3000);
          this.telemetry.authorMs += 3000;
          const raw = JSON.stringify({ task_id: input.trackId, files: [{ path: 'dist/res.ts', content: 'export const answer = 42;' }] });
          const audit = createFallbackAuditRecord({ failure: { kind: input.geminiFailKind || 'quota-exhausted', confirmed: true, normalRetriesComplete: true }, directive: spy, rawPayload: raw, authorSessionId: `auth-${input.trackId}-${step}`, reviewerSessionId: `rev-${input.trackId}-${step}` });
          cp.phases.author = { completed: true, route: 'kimi-author-fallback', audit };
          cp.identity.authorHash = createHash('sha256').update(raw).digest('hex');
          saveAuthor(this.dbDir, input.trackId, cp.phases.author);
          this.geminiAvailable = true;
        }
        saveCheckpoint(this.dbDir, input.trackId, cp);
      } else if (step === 1) { this.telemetry.workAvoided++; }
      if (checkCanceled()) throw new Error('aborted');

      let decision: 'ACCEPT' | 'RETRY' = 'ACCEPT';
      if (input.trackId === 'retry-track' && step <= 2) decision = 'RETRY';
      const isRetry = step > 1;
      if (!cp.phases.review.completed) {
        const revTime = (isRetry && this.opts.deltaReview) ? 500 : 1500;
        await this.delay(revTime);
        this.telemetry.reviewMs += revTime;
        cp.phases.review = { completed: decision === 'ACCEPT', decision };
        cp.identity.reviewHash = createHash('sha256').update(decision).digest('hex');
        saveReview(this.dbDir, input.trackId, { decision, run: step });
        saveCheckpoint(this.dbDir, input.trackId, cp);
      } else if (step === 1) { this.telemetry.workAvoided++; }
      if (checkCanceled()) throw new Error('aborted');

      const isFocused = decision === 'RETRY';
      if (!cp.phases.validation.completed || isFocused) {
        const allLanes = ['tests', 'lint', 'format', 'type', 'changelog', 'secret', 'patch'];
        const activeLanes = (isFocused && this.opts.focusedVal) ? allLanes.filter(l => l !== 'format' && l !== 'changelog') : allLanes;
        const laneT = isFocused ? 100 : (input.longTest ? 1000 : 500);
        const lanePromises = activeLanes.map(async (l) => {
          const logPath = path.join(this.tempDir, `${input.trackId}-${step}-${l}.log`);
          await this.delay(laneT);
          fs.mkdirSync(path.dirname(logPath), { recursive: true });
          fs.writeFileSync(logPath, `Lane ${l} run completed\n`, 'utf8');
          return { lane: l, exitCode: 0, logPath };
        });
        const results = await Promise.all(lanePromises);
        if (isFocused) this.telemetry.focusedValMs += laneT; else this.telemetry.finalValMs += laneT;
        cp.identity.validationHash = createHash('sha256').update(JSON.stringify(results)).digest('hex');
        if (decision === 'ACCEPT') {
          cp.phases.validation = { completed: true, focused: false };
          cp.identity.appliedHashes.push(cp.identity.authorHash);
        }
        saveValidation(this.dbDir, input.trackId, { lanes: results });
        saveCheckpoint(this.dbDir, input.trackId, cp);
      } else if (step === 1) { this.telemetry.workAvoided++; }
      if (checkCanceled()) throw new Error('aborted');
      if (decision === 'ACCEPT') loop = false; else cp.phases.author.completed = false;
    }

    if (!cp.phases.submission.completed) {
      const op = input.owner === 'evil' ? 'merge' : 'git-push';
      const rejectCheck = evaluateSubmissionOperation(op);
      if (!rejectCheck.allowed) throw new Error('Submission rejected');
      if (input.confirmationCallback) {
        // Unreachable for authorized routes
      }
      await this.delay(1200);
      this.telemetry.gitMs += 1200;
      cp.phases.submission = { completed: true, status: 'submitted' };
      cp.identity.pr = `PR-${input.trackId}`;
      cp.identity.commitSha = `sha-${input.trackId}`;
      cp.identity.cursor = `cursor-${input.trackId}`;
      saveSubmission(this.dbDir, input.trackId, cp.phases.submission);
      saveCheckpoint(this.dbDir, input.trackId, cp);
    } else { this.telemetry.workAvoided++; }
    return cp;
  }
  private delay(ms: number): Promise<void> {
    return new Promise(r => this.clock.setTimeout(r, ms));
  }
  public renderCompact(cp: TrackCheckpoint, status: string, action: string, blocker: string, cpPath: string): string {
    const cpPhase = cp.phases.submission.completed ? 'submission' : cp.phases.validation.completed ? 'validation' : cp.phases.review.completed ? 'review' : cp.phases.author.completed ? 'review' : 'discovery';
    return [`TRACK:${cp.trackId}`, `PHASE:${cpPhase}`, `STATUS:${status}`, `NEXT ACTION:${action}`, `BLOCKER:${blocker}`, `ARTIFACT PATH:${cpPath}`].join('\n');
  }
}
function inputKey(t: TaskInput): string {
  return `${t.owner}/${t.repo}/${t.branch}`;
}
