import * as fs from 'node:fs';
import * as path from 'node:path';
import { TrackCheckpoint, RepositoryProfile } from './types.js';

function writeAtomic(f: string, content: string): void {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', content.replace(/\r\n/g, '\n') + '\n', 'utf8');
  fs.renameSync(f + '.tmp', f);
}
export function saveCheckpoint(db: string, id: string, cp: TrackCheckpoint) {
  writeAtomic(path.join(db, 'tracks', id, 'checkpoint.json'), JSON.stringify(cp, null, 2));
}
export function loadCheckpoint(db: string, id: string): TrackCheckpoint | null {
  const p = path.join(db, 'tracks', id, 'checkpoint.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}
export function saveDirective(db: string, id: string, dir: any) {
  writeAtomic(path.join(db, 'tracks', id, 'directive.json'), JSON.stringify(dir, null, 2));
}
export function saveAuthor(db: string, id: string, auth: any) {
  writeAtomic(path.join(db, 'tracks', id, 'author.json'), JSON.stringify(auth, null, 2));
}
export function saveReview(db: string, id: string, rev: any) {
  writeAtomic(path.join(db, 'tracks', id, 'review.json'), JSON.stringify(rev, null, 2));
}
export function saveValidation(db: string, id: string, val: any) {
  writeAtomic(path.join(db, 'tracks', id, 'validation.json'), JSON.stringify(val, null, 2));
}
export function saveSubmission(db: string, id: string, sub: any) {
  writeAtomic(path.join(db, 'tracks', id, 'submission.json'), JSON.stringify(sub, null, 2));
}
export function logEvent(db: string, id: string, ev: any) {
  const line = JSON.stringify(ev) + '\n';
  const p1 = path.join(db, 'tracks', id, 'events.jsonl');
  fs.mkdirSync(path.dirname(p1), { recursive: true });
  fs.appendFileSync(p1, line, 'utf8');
  const p2 = path.join(db, 'events.jsonl');
  fs.mkdirSync(path.dirname(p2), { recursive: true });
  fs.appendFileSync(p2, line, 'utf8');
}
export function saveRepositoryProfile(db: string, owner: string, repo: string, p: RepositoryProfile) {
  writeAtomic(path.join(db, 'profiles', `${owner}-${repo}.json`), JSON.stringify(p, null, 2));
}
export function loadRepositoryProfile(db: string, owner: string, repo: string): RepositoryProfile | null {
  const f = path.join(db, 'profiles', `${owner}-${repo}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
