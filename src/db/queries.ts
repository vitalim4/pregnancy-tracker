import { pool } from './index';

// ── Users ─────────────────────────────────────────────────────────────────────

export async function upsertUser(id: number, firstName: string, username?: string) {
  await pool.query(
    `INSERT INTO users (id, first_name, username)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET first_name = $2, username = $3`,
    [id, firstName, username ?? null],
  );
}

export async function getUser(id: number) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

// ── Pregnancies ───────────────────────────────────────────────────────────────

export async function createPregnancy(userId: number, lmpDate: Date, nickname?: string) {
  const { rows } = await pool.query(
    `INSERT INTO pregnancies (user_id, lmp_date, nickname)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, lmpDate, nickname ?? null],
  );
  return rows[0];
}

export async function markBagChecklistSent(userId: number) {
  await pool.query(
    `UPDATE pregnancies SET bag_checklist_sent = TRUE WHERE user_id = $1 AND is_active = TRUE`,
    [userId],
  );
}

export async function updatePregnancyLmp(userId: number, lmpDate: Date) {
  await pool.query(
    `UPDATE pregnancies SET lmp_date = $2 WHERE user_id = $1 AND is_active = TRUE`,
    [userId, lmpDate],
  );
}

export async function getActivePregnancy(userId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM pregnancies WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export function getCurrentWeek(lmpDate: Date): number {
  const msPerWeek = 1000 * 60 * 60 * 24 * 7;
  const weeks = Math.floor((Date.now() - lmpDate.getTime()) / msPerWeek);
  return Math.min(Math.max(weeks, 1), 42);
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function createTask(userId: number, pregnancyId: number, title: string, dueWeek?: number) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (user_id, pregnancy_id, title, due_week)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, pregnancyId, title, dueWeek ?? null],
  );
  return rows[0];
}

export async function getTasks(userId: number, includeCompleted = false) {
  const { rows } = await pool.query(
    `SELECT * FROM tasks WHERE user_id = $1 ${includeCompleted ? '' : 'AND completed = FALSE'}
     ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function completeTask(taskId: number, userId: number) {
  await pool.query(
    `UPDATE tasks SET completed = TRUE WHERE id = $1 AND user_id = $2`,
    [taskId, userId],
  );
}

// ── Reminders ─────────────────────────────────────────────────────────────────

export async function createReminder(userId: number, pregnancyId: number, title: string, remindAt: Date) {
  const { rows } = await pool.query(
    `INSERT INTO reminders (user_id, pregnancy_id, title, remind_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, pregnancyId, title, remindAt],
  );
  return rows[0];
}

export async function getPendingReminders() {
  const { rows } = await pool.query(
    `SELECT r.*, u.id as telegram_id FROM reminders r
     JOIN users u ON r.user_id = u.id
     WHERE r.remind_at <= NOW() AND r.is_sent = FALSE AND r.is_active = TRUE`,
  );
  return rows;
}

export async function markReminderSent(id: number) {
  await pool.query(`UPDATE reminders SET is_sent = TRUE WHERE id = $1`, [id]);
}

export async function cancelReminder(id: number, userId: number) {
  await pool.query(
    `UPDATE reminders SET is_active = FALSE WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
}

export async function getReminders(userId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM reminders WHERE user_id = $1 AND is_active = TRUE AND is_sent = FALSE
     ORDER BY remind_at ASC`,
    [userId],
  );
  return rows;
}

// ── Pregnancy tests ────────────────────────────────────────────────────────────

export async function getCompletedTests(userId: number): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT test_id FROM completed_tests WHERE user_id = $1`,
    [userId],
  );
  return rows.map((r: any) => r.test_id);
}

export async function markTestCompleted(userId: number, testId: string, notes?: string) {
  await pool.query(
    `INSERT INTO completed_tests (user_id, test_id, notes)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, test_id) DO UPDATE SET completed_at = NOW(), notes = $3`,
    [userId, testId, notes ?? null],
  );
}

export async function unmarkTestCompleted(userId: number, testId: string) {
  await pool.query(
    `DELETE FROM completed_tests WHERE user_id = $1 AND test_id = $2`,
    [userId, testId],
  );
}

// ── Recurring reminders ────────────────────────────────────────────────────────

export async function createRecurringReminder(userId: number, title: string, intervalMinutes: number) {
  const nextSendAt = new Date(Date.now() + intervalMinutes * 60 * 1000);
  const { rows } = await pool.query(
    `INSERT INTO recurring_reminders (user_id, title, interval_minutes, next_send_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, title, intervalMinutes, nextSendAt],
  );
  return rows[0];
}

export async function getDueRecurringReminders() {
  const { rows } = await pool.query(
    `SELECT * FROM recurring_reminders WHERE next_send_at <= NOW() AND is_active = TRUE`,
  );
  return rows;
}

export async function advanceRecurringReminder(id: number, intervalMinutes: number) {
  await pool.query(
    `UPDATE recurring_reminders SET next_send_at = NOW() + ($2 || ' minutes')::INTERVAL WHERE id = $1`,
    [id, intervalMinutes],
  );
}

export async function getRecurringReminders(userId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM recurring_reminders WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at ASC`,
    [userId],
  );
  return rows;
}

export async function deleteRecurringReminder(id: number, userId: number) {
  await pool.query(
    `UPDATE recurring_reminders SET is_active = FALSE WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
}

export async function deactivateAllUserReminders(userId: number) {
  await pool.query(`UPDATE reminders SET is_active = FALSE WHERE user_id = $1`, [userId]);
  await pool.query(`UPDATE recurring_reminders SET is_active = FALSE WHERE user_id = $1`, [userId]);
  await pool.query(`UPDATE users SET morning_digest_enabled = FALSE WHERE id = $1`, [userId]);
}

// ── Morning digest ─────────────────────────────────────────────────────────────

export async function setMorningDigest(userId: number, enabled: boolean, hour = 8) {
  await pool.query(
    `UPDATE users SET morning_digest_enabled = $2, morning_digest_hour = $3 WHERE id = $1`,
    [userId, enabled, hour],
  );
}

export async function getUsersDueMorningDigest() {
  const { rows } = await pool.query(
    `SELECT id FROM users
     WHERE morning_digest_enabled = TRUE
       AND morning_digest_hour = EXTRACT(HOUR FROM NOW())
       AND (morning_digest_sent_date IS NULL OR morning_digest_sent_date < CURRENT_DATE)`,
  );
  return rows as { id: number }[];
}

export async function markMorningDigestSent(userId: number) {
  await pool.query(
    `UPDATE users SET morning_digest_sent_date = CURRENT_DATE WHERE id = $1`,
    [userId],
  );
}

// ── Conversation history ───────────────────────────────────────────────────────

export async function saveMessage(userId: number, role: 'user' | 'assistant', content: string) {
  await pool.query(
    `INSERT INTO messages (user_id, role, content) VALUES ($1, $2, $3)`,
    [userId, role, content],
  );
  // Keep only last 20 messages per user to control context size
  await pool.query(
    `DELETE FROM messages WHERE user_id = $1 AND id NOT IN (
       SELECT id FROM messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20
     )`,
    [userId],
  );
}

export async function getHistory(userId: number) {
  const { rows } = await pool.query(
    `SELECT role, content FROM messages WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  return rows as { role: 'user' | 'assistant'; content: string }[];
}
