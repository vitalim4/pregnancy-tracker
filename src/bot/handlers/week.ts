import { Context } from 'telegraf';
import { getActivePregnancy, getCurrentWeek } from '../../db/queries';
import { getWeekData } from '../../content/weeklyData';
import { format } from 'date-fns';

export async function handleWeek(ctx: Context) {
  const userId = ctx.from!.id;
  const pregnancy = await getActivePregnancy(userId);

  if (!pregnancy) {
    await ctx.reply('עדיין לא הזנת תאריך תחילת הריון. שלחי /start כדי להתחיל.');
    return;
  }

  const lmpDate = new Date(pregnancy.lmp_date);
  const week = getCurrentWeek(lmpDate);
  const dueDate = new Date(pregnancy.due_date);
  const data = getWeekData(week);

  if (!data) {
    await ctx.reply(`את בשבוע ${week} – עוד מעט יהיה לי יותר מידע עבורך! 💕`);
    return;
  }

  const weeksLeft = Math.max(40 - week, 0);
  const dueDateStr = format(dueDate, 'dd/MM/yyyy');

  const message = [
    `🤰 *שבוע ${week} להריון*`,
    '',
    `👶 *גודל התינוק:* ${data.babySize}`,
    `📏 *אורך:* ${data.length}  |  ⚖️ *משקל:* ${data.weight}`,
    '',
    `✨ *התפתחות השבוע:*`,
    data.development,
    '',
    `💡 *טיפים לשבוע הזה:*`,
    ...data.tips.map((t) => `• ${t}`),
    '',
    `📅 תאריך לידה משוער: ${dueDateStr}`,
    `⏳ נותרו כ-${weeksLeft} שבועות`,
  ].join('\n');

  await ctx.reply(message, { parse_mode: 'Markdown' });
}
