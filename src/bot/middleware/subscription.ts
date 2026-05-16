import { Context } from 'telegraf';
import { config } from '../../config';
import { getUserSubscription } from '../../db/queries';

const TRIAL_DAYS = 7;
export const FREE_AI_LIMIT = 10;
export const PAID_AI_LIMIT = 30;

export function getAccessStatus(user: any) {
  const now = new Date();
  const trialEnd = new Date(new Date(user.created_at).getTime() + TRIAL_DAYS * 86400_000);
  const isTrial = now < trialEnd;
  const isPaid = !!user.subscription_expires_at && new Date(user.subscription_expires_at) > now;
  const daysLeft = isTrial ? Math.ceil((trialEnd.getTime() - now.getTime()) / 86400_000) : 0;
  const aiLimit = isPaid ? PAID_AI_LIMIT : FREE_AI_LIMIT;
  return { hasAccess: isTrial || isPaid, isTrial, isPaid, daysLeft, aiLimit };
}

export async function checkSubscription(ctx: Context): Promise<boolean> {
  const userId = ctx.from!.id;
  if (userId === config.adminUserId) return true;

  const user = await getUserSubscription(userId);
  if (!user) return true;

  const { hasAccess, isTrial, daysLeft } = getAccessStatus(user);

  if (!hasAccess) {
    await ctx.reply(
      `⏰ *תקופת הניסיון שלך הסתיימה*\n\n` +
      `להמשך שימוש בעוזרת ההריון, שלמי ₪19.90 לחודש.\n\n` +
      `👉 /subscribe`,
      { parse_mode: 'Markdown' },
    );
    return false;
  }

  if (isTrial && daysLeft <= 2) {
    await ctx.reply(`⚠️ נשאר לך ${daysLeft === 1 ? 'יום אחד' : 'יומיים'} בניסיון החינמי! /subscribe`);
  }

  return true;
}