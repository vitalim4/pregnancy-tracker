import { Context } from 'telegraf';
import { upsertUser, getActivePregnancy } from '../../db/queries';

export async function handleStart(ctx: Context) {
  const user = ctx.from!;
  await upsertUser(user.id, user.first_name, user.username);

  const pregnancy = await getActivePregnancy(user.id);

  if (pregnancy) {
    await ctx.reply(
      `ברוכה השבה, ${user.first_name}! 👶\n\nאני כאן לתמוך בך לאורך כל ההריון.\nשלחי /week לעדכון שבועי, /tasks למשימות, או פשוט כתבי לי איך את מרגישה.`,
    );
    return;
  }

  await ctx.reply(
    `שלום ${user.first_name}! 🌸\n\nאני העוזרת האישית שלך להריון.\n\nבואי נתחיל! מתי היה היום הראשון של הווסת האחרונה שלך (LMP)?\n\nשלחי תאריך בפורמט: DD/MM/YYYY\nלדוגמה: 15/01/2025`,
  );
}
