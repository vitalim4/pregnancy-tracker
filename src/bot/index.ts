import { Telegraf, Context } from 'telegraf';
import { config } from '../config';
import { upsertUser, getActivePregnancy, getCurrentWeek } from '../db/queries';
import { handleStart } from './handlers/start';
import { handleWeek } from './handlers/week';
import { handleTasks, handleAddTask, handleDoneTask } from './handlers/tasks';
import { handleReminders, handleAddReminder, handleMorningDigest, sendCalendarLinks } from './handlers/reminders';
import { handleOnboarding } from './middleware/onboarding';
import { chat } from '../agent';

export const bot = new Telegraf(config.telegram.token);

// ── Commands ───────────────────────────────────────────────────────────────────

bot.start(handleStart);

bot.command('week', handleWeek);

bot.command('tasks', handleTasks);
bot.command('addtask', handleAddTask);
bot.command('done', handleDoneTask);

bot.command('reminders', handleReminders);
bot.command('remind', handleAddReminder);
bot.command('morning', handleMorningDigest);

bot.command('help', async (ctx) => {
  await ctx.reply(
    `🌸 *עוזרת ההריון שלך* 🌸\n\n` +
      `*פקודות:*\n` +
      `/week – עדכון שבועי על התינוק\n` +
      `/tasks – רשימת משימות\n` +
      `/addtask [כותרת] – הוספת משימה\n` +
      `/done [מספר] – סימון משימה כהושלמה\n` +
      `/reminders – תזכורות\n` +
      `/remind DD/MM/YYYY HH:MM [כותרת] – תזכורת חדשה\n` +
      `/morning on – תזכורת בוקר יומית עם המשימות\n` +
      `/morning off – כיבוי תזכורת בוקר\n\n` +
      `או פשוט כתבי לי איך את מרגישה! 💕`,
    { parse_mode: 'Markdown' },
  );
});

// ── Text messages → onboarding or agent ───────────────────────────────────────

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;

  // Ensure user exists
  await upsertUser(userId, ctx.from.first_name, ctx.from.username);

  // Send typing indicator
  await ctx.sendChatAction('typing');

  // Handle onboarding first
  const handled = await handleOnboarding(ctx);
  if (handled) return;

  // Build pregnancy context for agent
  const pregnancy = await getActivePregnancy(userId);
  const agentCtx = {
    userId,
    currentWeek: pregnancy ? getCurrentWeek(new Date(pregnancy.lmp_date)) : undefined,
    dueDate: pregnancy?.due_date
      ? new Date(pregnancy.due_date).toLocaleDateString('he-IL')
      : undefined,
    babyNickname: pregnancy?.nickname ?? undefined,
  };

  try {
    const result = await chat(ctx.message.text, agentCtx);
    if (result.message) {
      await ctx.reply(result.message);
    }
    if (result.reminder) {
      await sendCalendarLinks(ctx, result.reminder.title, result.reminder.remindAt);
    }
  } catch (err) {
    console.error('Agent error:', err);
    await ctx.reply('אופס, משהו השתבש. נסי שוב בעוד רגע. 🙏');
  }
});

// ── Error handler ──────────────────────────────────────────────────────────────

bot.catch((err, ctx) => {
  console.error(`Bot error for update ${ctx.update.update_id}:`, err);
});
