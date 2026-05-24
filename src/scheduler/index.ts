import { Queue, Worker } from 'bullmq';
import { config } from '../config';
import { getPendingReminders, markReminderSent, getUsersDueMorningDigest, markMorningDigestSent, getTasks, getActivePregnancy, getCurrentWeek, getCompletedTests, markBagChecklistSent, getDueRecurringReminders, advanceRecurringReminder, deactivateAllUserReminders, getUsersDueRenewalReminder, markRenewalReminderSent } from '../db/queries';
import { getWeekData } from '../content/weeklyData';
import { getUpcomingTests } from '../content/pregnancyTests';
import { hospitalBagChecklist } from '../content/hospitalBag';
import { bot } from '../bot';

function isUserBlockedError(err: any): boolean {
  const msg: string = err?.response?.description ?? err?.message ?? '';
  return msg.includes('bot was blocked') || msg.includes('user is deactivated') || msg.includes('chat not found');
}

async function safeSend(userId: number, text: string, extra?: any): Promise<boolean> {
  try {
    await bot.telegram.sendMessage(userId, text, extra);
    return true;
  } catch (err) {
    if (isUserBlockedError(err)) {
      console.log(`User ${userId} blocked the bot – deactivating all reminders`);
      await deactivateAllUserReminders(userId);
    } else {
      console.error(`Failed to send message to ${userId}:`, err);
    }
    return false;
  }
}

// Pass plain options so BullMQ uses its own bundled ioredis
const connection = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL, maxRetriesPerRequest: null as null }
  : { host: config.redis.host, port: config.redis.port, maxRetriesPerRequest: null as null };

const QUEUE_NAME = 'reminders';

export const reminderQueue = new Queue(QUEUE_NAME, { connection });

// Poll for pending reminders every minute and enqueue them
export async function startReminderPoller(): Promise<void> {
  async function poll() {
    try {
      const due = await getPendingReminders();
      for (const reminder of due) {
        // Use reminder ID as jobId to prevent duplicate enqueuing across polls.
        // markReminderSent is called by the worker after successful delivery.
        await reminderQueue.add(
          'send',
          { reminderId: reminder.id, telegramId: reminder.telegram_id, title: reminder.title },
          { jobId: `reminder-${reminder.id}`, removeOnComplete: true, removeOnFail: true },
        );
      }
    } catch (err) {
      console.error('Reminder poller error:', err);
    }
  }

  await poll(); // run immediately on start
  setInterval(poll, 60 * 1000); // then every minute
  console.log('✅ Reminder poller started');
}

// Worker that sends the Telegram message, then marks the reminder as sent
export function startReminderWorker(): void {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { reminderId, telegramId, title } = job.data;
      const sent = await safeSend(telegramId, `🔔 תזכורת: ${title}`);
      if (sent) await markReminderSent(reminderId);
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    console.error(`Reminder job ${job?.id} failed:`, err);
  });

  console.log('✅ Reminder worker started');
}

// Poll every minute for due recurring reminders
export async function startRecurringReminderPoller(): Promise<void> {
  async function poll() {
    try {
      const due = await getDueRecurringReminders();
      for (const r of due) {
        await safeSend(r.user_id, `🔁 תזכורת: ${r.title}`);
        await advanceRecurringReminder(r.id, r.interval_minutes);
      }
    } catch (err) {
      console.error('Recurring reminder poller error:', err);
    }
  }

  await poll();
  setInterval(poll, 60 * 1000);
  console.log('✅ Recurring reminder poller started');
}

// Poll every minute for users who should receive morning digest
export async function startMorningDigestPoller(): Promise<void> {
  async function poll() {
    try {
      const users = await getUsersDueMorningDigest();
      for (const user of users) {
        const [tasks, pregnancy, completedTests] = await Promise.all([getTasks(user.id), getActivePregnancy(user.id), getCompletedTests(user.id)]);
        await markMorningDigestSent(user.id);

        const parts: string[] = ['☀️ בוקר טוב!'];

        // Baby update
        if (pregnancy) {
          const week = getCurrentWeek(new Date(pregnancy.lmp_date));
          const weekData = getWeekData(week);
          parts.push('');
          parts.push(`🤰 *שבוע ${week} להריון*`);
          if (weekData) {
            parts.push(`👶 התינוק בגודל של ${weekData.babySize} (${weekData.length}, ${weekData.weight})`);
            parts.push(`✨ ${weekData.development}`);
          }

          // Upcoming tests
          const upcomingTests = getUpcomingTests(week).filter(t => !completedTests.includes(t.id));
          if (upcomingTests.length > 0) {
            parts.push('');
            parts.push('🔬 *בדיקות לבצע בתקופה זו:*');
            upcomingTests.forEach(t => parts.push(`• ${t.name} (שבוע ${t.weekFrom}–${t.weekTo})`));
          }

          // Hospital bag checklist at week 35
          if (week >= 35 && !pregnancy.bag_checklist_sent) {
            await markBagChecklistSent(user.id);
            await safeSend(user.id, hospitalBagChecklist, { parse_mode: 'Markdown' });
          } else if (week >= 35 && pregnancy.bag_checklist_sent) {
            parts.push('');
            parts.push('👜 תיק הלידה מוכן? כתבי "תיק לידה" אם תרצי לראות את הרשימה שוב.');
          }
        }

        // Tasks
        parts.push('');
        if (tasks.length === 0) {
          parts.push('📋 אין משימות פתוחות. יום נעים! 💕');
        } else {
          parts.push('📋 *המשימות שלך:*');
          tasks.forEach((t: any, i: number) => parts.push(`${i + 1}. ${t.title}`));
        }

        await safeSend(user.id, parts.join('\n'), { parse_mode: 'Markdown' });
      }
    } catch (err) {
      console.error('Morning digest poller error:', err);
    }
  }

  await poll();
  setInterval(poll, 60 * 1000);
  console.log('✅ Morning digest poller started');
}

export async function startRenewalReminderPoller(): Promise<void> {
  async function poll() {
    try {
      const users = await getUsersDueRenewalReminder();
      for (const user of users) {
        await safeSend(user.id,
          `⏰ המנוי שלך פג בעוד יומיים!\n\nכדי להמשיך ליהנות מהעוזרת האישית שלך, חדשי את המנוי:\n/subscribe`,
        );
        await markRenewalReminderSent(user.id);
      }
    } catch (err) {
      console.error('Renewal reminder poller error:', err);
    }
  }

  await poll();
  setInterval(poll, 60 * 60 * 1000); // check every hour
  console.log('✅ Renewal reminder poller started');
}