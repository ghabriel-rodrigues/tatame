/**
 * Attendance display helpers (ATT.15-18). Pure formatting — every figure is
 * server-derived; nothing here recomputes attendance rules.
 */

/** "09:42" countdown to an ISO expiry; clamps at 00:00 once past. */
export function countdownLabel(expiresAt: string, now: Date = new Date()): string {
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now.getTime());
  const totalSeconds = Math.floor(remaining / 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`;
}

/** True once the ISO expiry is in the past. */
export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

/** "Essa é a sua 7ª aula seguida. Bom treino!" (aluno-05 success line). */
export function streakLine(streak: number): string {
  return `Essa é a sua ${streak}ª aula seguida. Bom treino!`;
}

/** "14:32" clock label from an ISO datetime (arriving list rows). */
export function timeLabel(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "Bom dia" / "Boa tarde" / "Boa noite" (professor-02 greeting). */
export function greetingPt(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}
