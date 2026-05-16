import { Context, MiddlewareFn } from 'telegraf';
import { getUser, getActivePregnancy, createPregnancy, upsertUser } from '../../db/queries';
import { parse, isValid } from 'date-fns';

/**
 * Intercepts text messages to handle the onboarding flow
 * (collecting LMP date) before passing to the agent.
 * Returns true if message was handled by onboarding.
 */
export async function handleOnboarding(ctx: Context): Promise<boolean> {
  const userId = ctx.from!.id;
  const text = ((ctx.message as any)?.text ?? '').trim();

  // Skip commands
  if (text.startsWith('/')) return false;

  const user = await getUser(userId);
  if (!user) return false;

  const pregnancy = await getActivePregnancy(userId);
  if (pregnancy) return false; // Already set up – pass to agent

  // Try to parse a date in DD/MM/YYYY format
  const dateMatch = text.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (!dateMatch) {
    await ctx.reply(
      'כדי להתחיל, אנא שלחי את תאריך תחילת הווסת האחרונה שלך בפורמט:\n*DD/MM/YYYY*\nלדוגמה: *15/01/2025*',
      { parse_mode: 'Markdown' },
    );
    return true;
  }

  const lmpDate = parse(text.replace(/[\-\.]/g, '/'), 'dd/MM/yyyy', new Date());

  if (!isValid(lmpDate) || lmpDate > new Date()) {
    await ctx.reply('תאריך לא תקין. אנא שלחי תאריך עבר בפורמט DD/MM/YYYY.');
    return true;
  }

  await createPregnancy(userId, lmpDate);
  await ctx.reply(
    `🎉 מזל טוב! רשמתי את ההריון שלך.\n\nשלחי /week לראות מה קורה השבוע עם התינוק שלך! 👶`,
  );
  return true;
}
