import { openDB } from 'idb';
import type { Session, Config } from './model';
const database = openDB('festival-keyframe-lab', 1, { upgrade(db) { db.createObjectStore('state'); } });
export async function readSession(): Promise<Session | undefined> { return (await database).get('state', 'session'); }
export async function saveSession(s: Session) { await (await database).put('state', s, 'session'); }
export async function clearSession() { await (await database).delete('state', 'session'); }
export async function readConfig(): Promise<Config | undefined> { return (await database).get('state', 'config'); }
export async function saveConfig(c: Config) { await (await database).put('state', c, 'config'); }
