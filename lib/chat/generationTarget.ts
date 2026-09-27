import { resolveCompletionDate } from '../planning/recordCompletion';
import { readCoachProfile } from './coachFirstStore';

export function generationWeeks(today: string) {
  const current = resolveCompletionDate(today);
  if (!current || current.date !== today) throw new Error('GENERATION_WEEK_INVALID');
  return { current: current.weekStart, next: new Date(Date.parse(current.weekStart + 'T12:00:00Z') + 7 * 86400000).toISOString().slice(0,10) };
}
/** Pending targets come from server journal receipts, never client pending text or date arithmetic by the LLM. */
export async function resolveGenerationTarget(db: any, user: string, today: string, period: unknown) {
  const weeks = generationWeeks(today);
  if (period === 'current_week') return weeks.current;
  if (period === 'next_week') return weeks.next;
  if (period !== 'pending') throw new Error('GENERATION_TARGET_INVALID');
  const profile = await readCoachProfile(db, user);
  const turns = Object.values(profile?.coach_first_turns ?? {}).filter((t: any) => t.finishedAt)
    .sort((a: any,b: any) => b.finishedAt.localeCompare(a.finishedAt)) as any[];
  for (const turn of turns) {
    for (const receipt of [...(turn.receipts ?? [])].reverse()) {
      // A dispatched generation is never silently replayed, even after a provider or readback failure.
      if (receipt.tool === 'generate_week') throw new Error('GENERATION_PENDING_ALREADY_ATTEMPTED');
      if (turn.persisted === true && receipt.tool === 'prepare_generation' && receipt.status === 'prepared') {
        const target = receipt.generationTarget?.weekStart;
        if (![weeks.current, weeks.next].includes(target)) throw new Error('GENERATION_PENDING_EXPIRED');
        return target as string;
      }
    }
  }
  throw new Error('GENERATION_PENDING_MISSING');
}
