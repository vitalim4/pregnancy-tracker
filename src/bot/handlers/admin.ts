import { Context } from 'telegraf';
import { config } from '../../config';
import { grantSubscription, getBotStats } from '../../db/queries';

function isAdmin(ctx: Context): boolean {
  return ctx.from?.id === config.adminUserId;
}

export async function handleGrant(ctx: Context) {
  if (!isAdmin(ctx)) return;
  const text = (ctx.message as any)?.text ?? '';
  const match = text.match(/^\/grant\s+(\d+)\s+(\d+)$/);
  if (!match) {
    await ctx.reply('Usage: /grant <userId> <days>');
    return;
  }
  const [, userId, days] = match;
  await grantSubscription(parseInt(userId), parseInt(days));
  await ctx.reply(`✅ Granted ${days} days to user ${userId}`);
}

export async function handleStats(ctx: Context) {
  if (!isAdmin(ctx)) return;
  const stats = await getBotStats();
  await ctx.reply(
    `📊 *Bot Stats*\n\n` +
    `👥 Total users: ${stats.total_users}\n` +
    `💳 Paid: ${stats.paid_users}\n` +
    `🆕 New (last 7d): ${stats.new_users}`,
    { parse_mode: 'Markdown' },
  );
}