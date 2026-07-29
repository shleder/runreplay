export type TrackPriority = 'maintainer' | 'changes-requested' | 'ready-submit' | 'reproduced' | 'discovery';
export interface RepositoryProfile {
  owner: string;
  repo: string;
  defaultBranch: string;
  testCmd: string;
  focusedCmd: string;
  lintCmd: string;
  formatCmd: string;
  typeCmd: string;
  changelogCmd: string;
  template: string;
  fork: boolean;
  remotes: string[];
  baseline: string;
  CI: string;
  toolchain: string;
  env: Record<string, string>;
}
export interface TrackIdentity {
  issueId: string;
  base: string;
  reproduction: {
    command: string;
    result: string;
    artifactHash: string;
  };
  directiveHash: string;
  authorHash: string;
  appliedHashes: string[];
  reviewHash: string;
  validationHash: string;
  branch: string;
  commitSha: string;
  pr: string | null;
  cursor: string | null;
}
export interface TrackCheckpoint {
  trackId: string;
  priority: TrackPriority;
  branchKey: string;
  identity: TrackIdentity;
  phases: {
    discovery: { completed: boolean };
    repro: { completed: boolean };
    author: { completed: boolean; route: 'gemini' | 'kimi-author-fallback'; audit?: any };
    review: { completed: boolean; decision?: 'ACCEPT' | 'RETRY' };
    validation: { completed: boolean; focused: boolean };
    submission: { completed: boolean; status?: string };
  };
  events: any[];
}
export interface WatcherEvent {
  id: string;
  type: 'comment' | 'review' | 'ci_status' | 'closure' | 'merge' | 'conflict_preemption' | 'changes_requested';
  payload: any;
}
