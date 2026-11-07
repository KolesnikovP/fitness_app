import type { UnitPreference } from '@/shared/model';

import {
  countOf,
  formatDuration,
  formatVolume,
  setRuns,
  type PersonalRecord,
  type Session,
  type SessionSet,
} from './model';

/** The one fixed factor a weight in lb is converted to kg by, as the API converts. */
const KG_PER_LB = 0.45359237;

/** weight, logged in from, in unit: converted, to 2 decimals as weights are kept. */
function inUnit(weight: number, from: UnitPreference, unit: UnitPreference): number {
  if (from === unit) return weight;
  const converted = from === 'lb' ? weight * KG_PER_LB : weight / KG_PER_LB;
  return Math.round(converted * 100) / 100;
}

/** "Thursday, November 5, 2026" */
function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** "102.06 kg × 3 @ RPE 8.5, note: Belt on" */
function setLine(set: SessionSet, unit: UnitPreference): string {
  let line = `${inUnit(set.weight, set.weightUnit, unit)} ${unit} × ${set.reps}`;
  if (set.rpe !== null) line += ` @ RPE ${set.rpe}`;
  if (set.note) line += `, note: ${set.note}`;
  return line;
}

/** As formatPersonalRecord, with the Set's weight in unit too. */
function recordLine(record: PersonalRecord, unit: UnitPreference): string {
  const set = `${inUnit(record.weight, record.weightUnit, unit)} ${unit} × ${record.reps}`;
  return record.kind === 'estimated1RM'
    ? `${record.name}: Estimated 1RM ${record.estimated1RM} ${record.estimated1RMUnit}, from ${set}`
    : `${record.name}: ${set}, best at ${countOf(record.reps, 'rep')}`;
}

/**
 * A finished Session's Session summary: plain lines that read as Markdown,
 * to paste anywhere, such as into a chat with an AI. Its name and date; its
 * duration, Volume and Set count; each Exercise with every Set on its own
 * line (weight × reps, and its RPE and note when it has them), then the
 * Exercise's note; then its Personal records. Weights are in unit, the
 * User's Unit preference. Nothing is shortened, and the caption and Progress
 * photo, which are the Post's, are left out.
 */
export function sessionSummary(session: Session, unit: UnitPreference): string {
  const lines = [`# ${session.name}`, '', `- Date: ${formatLongDate(session.startedAt)}`];
  if (session.stats) {
    lines.push(
      `- Duration: ${formatDuration(session.stats.durationSeconds)}`,
      `- Volume: ${formatVolume(session.stats.volume, session.stats.volumeUnit)}`,
      `- Sets: ${session.stats.setCount}`,
    );
  }
  for (const exercise of session.exercises) {
    if (exercise.sets.length === 0) {
      lines.push('', `## ${exercise.name}`, '', 'No sets logged.');
    }
    // A Swap splits an Exercise's Sets into runs, each under the Exercise done.
    for (const run of setRuns(exercise)) {
      lines.push('', `## ${run.name}`, '');
      for (const { set, number } of run.sets) lines.push(`${number}. ${setLine(set, unit)}`);
    }
    if (exercise.note) lines.push('', `Note: ${exercise.note}`);
  }
  if (session.personalRecords.length > 0) {
    lines.push('', '## Personal records', '');
    for (const record of session.personalRecords) lines.push(`- ${recordLine(record, unit)}`);
  }
  return `${lines.join('\n')}\n`;
}
