import { openDB } from 'idb';
import type { Session, Config } from './model';
const database = openDB('festival-keyframe-lab', 1, { upgrade(db) { db.createObjectStore('state'); } });
export async function readSession(): Promise<Session | undefined> { return (await database).get('state', 'session'); }
export async function saveSession(s: Session) { await (await database).put('state', s, 'session'); }
export async function clearSession() { await (await database).delete('state', 'session'); }
export async function readConfig(): Promise<Config | undefined> { return (await database).get('state', 'config'); }
export async function saveConfig(c: Config) { await (await database).put('state', c, 'config'); }

// Prerequisites belong to a participant, independently of formal results.
export interface OnboardingProgress { read: boolean; practiced: boolean }
const participantPrefix = 'onboarding-participant:';
export async function readParticipantOnboarding(participant: string, legacySessionId?: string): Promise<OnboardingProgress> {
  const db = await database;
  const current = await db.get('state', participantPrefix + participant);
  const legacyRead = await db.get('state', 'reading-complete:' + participant);
  const legacyComplete = legacySessionId ? await db.get('state', 'onboarding-v2:' + legacySessionId) : false;
  const progress = { read: current?.read === true || legacyRead === true || legacyComplete === true, practiced: current?.practiced === true || legacyComplete === true };
  // Preserve completed work from earlier releases when restoring the original session.
  if (legacyRead === true || legacyComplete === true) await db.put('state', progress, participantPrefix + participant);
  return progress;
}
export async function completeParticipantOnboarding(participant: string, step: 'read' | 'practiced'): Promise<OnboardingProgress> {
  const db = await database;
  const tx = db.transaction('state', 'readwrite');
  const key = participantPrefix + participant;
  const previous = await tx.store.get(key);
  const progress = { read: true, practiced: previous?.practiced === true || step === 'practiced' };
  await tx.store.put(progress, key); await tx.done;
  return progress;
}
