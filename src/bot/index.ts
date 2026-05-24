import { Telegraf, Context } from 'telegraf';
import { config } from '../config';
import { upsertUser, getActivePregnancy, getCurrentWeek, getUserSubscription, incrementDailyAiCount } from '../db/queries';
import { handleStart } from './handlers/start';
import { handleWeek } from './handlers/week';
import { handleTasks, handleAddTask, handleDoneTask } from './handlers/tasks';
import { handleReminders, handleAddReminder, handleMorningDigest, sendCalendarLinks } from './handlers/reminders';
import { handleOnboarding } from './middleware/onboarding';
import { handleGrant, handleStats } from './handlers/admin';
import { checkSubscription, getAccessStatus, FREE_AI_LIMIT, PAID_AI_LIMIT } from './middleware/subscription';
import { createPayPalOrder } from '../services/paypal';
import { savePendingOrder } from '../db/queries';
import { chat } from '../agent';

export const bot = new Telegraf(config.telegram.token);

// ── Global subscription gate (skip /start and /subscribe) ─────────────────────

bot.use(async (ctx, next) => {
  const text = (ctx.message as any)?.text ?? '';
  if (text === '/start' || text.startsWith('/subscribe')) return next();
  if (!ctx.from) return next();
  const allowed = await checkSubscription(ctx);
  if (!allowed) return;
  return next();
});

// ── Commands ───────────────────────────────────────────────────────────────────

bot.start(handleStart);

bot.command('week', handleWeek);

bot.command('tasks', handleTasks);
bot.command('addtask', handleAddTask);
bot.command('done', handleDoneTask);

bot.command('reminders', handleReminders);
bot.command('remind', handleAddReminder);
bot.command('morning', handleMorningDigest);

bot.command('subscribe', async (ctx) => {
  const userId = ctx.from.id;
  try {
    await ctx.sendChatAction('typing');
    const { orderId, approvalUrl } = await createPayPalOrder(userId);
    await savePendingOrder(orderId, userId);
    await ctx.reply(
      `💳 מנוי חודשי – ₪19\\.90\n\n` +
      `✅ שיחה עם AI ללא הגבלה\n` +
      `✅ תזכורות חכמות\n` +
      `✅ מעקב בדיקות ומשימות\n` +
      `✅ עדכון בוקר יומי\n\n` +
      `👉 [לחצי כאן לתשלום מאובטח](${approvalUrl})\n\n` +
      `לאחר התשלום תקבלי אישור כאן בטלגרם 💕`,
      { parse_mode: 'MarkdownV2' },
    );
  } catch (err) {
    console.error('Subscribe error:', err);
    await ctx.reply('אופס, משהו השתבש. נסי שוב בעוד רגע. 🙏');
  }
});

bot.command('grant', handleGrant);
bot.command('stats', handleStats);

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

  // Daily AI message limit
  if (userId !== config.adminUserId) {
    const sub = await getUserSubscription(userId);
    if (sub) {
      const { aiLimit, isPaid } = getAccessStatus(sub);
      const count = await incrementDailyAiCount(userId);
      if (count > aiLimit) {
        await ctx.reply(
          isPaid
            ? `הגעת למגבלת ${PAID_AI_LIMIT} הודעות AI ליום. המגבלה תתאפס מחר! 🌙`
            : `הגעת למגבלת ${FREE_AI_LIMIT} הודעות AI ליום.\nשדרגי למנוי לקבל ${PAID_AI_LIMIT} הודעות ביום: /subscribe`,
        );
        return;
      }
    }
  }

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
