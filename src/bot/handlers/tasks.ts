import { Context, Markup } from 'telegraf';
import { getTasks, createTask, completeTask, getActivePregnancy } from '../../db/queries';

export async function handleTasks(ctx: Context) {
  const userId = ctx.from!.id;
  const tasks = await getTasks(userId);

  if (tasks.length === 0) {
    await ctx.reply(
      '📝 אין לך משימות פתוחות כרגע.\n\nכדי להוסיף משימה שלחי:\n/addtask כותרת המשימה',
    );
    return;
  }

  const lines = tasks.map((t: any, i: number) => `${i + 1}. ${t.title}`);
  const message = `📋 *המשימות שלך:*\n\n${lines.join('\n')}\n\nכדי לסמן כהושלמה שלחי:\n/done [מספר]`;

  await ctx.reply(message, { parse_mode: 'Markdown' });
}

export async function handleAddTask(ctx: Context) {
  const userId = ctx.from!.id;
  const text = (ctx.message as any)?.text ?? '';
  const title = text.replace(/^\/addtask\s*/i, '').trim();

  if (!title) {
    await ctx.reply('שלחי: /addtask כותרת המשימה\nלדוגמה: /addtask לתזמן בדיקת אולטרסאונד');
    return;
  }

  const pregnancy = await getActivePregnancy(userId);
  await createTask(userId, pregnancy?.id, title);
  await ctx.reply(`✅ המשימה נוספה: "${title}"`);
}

export async function handleDoneTask(ctx: Context) {
  const userId = ctx.from!.id;
  const text = (ctx.message as any)?.text ?? '';
  const indexStr = text.replace(/^\/done\s*/i, '').trim();
  const index = parseInt(indexStr, 10);

  if (isNaN(index) || index < 1) {
    await ctx.reply('שלחי: /done [מספר]\nלדוגמה: /done 1');
    return;
  }

  const tasks = await getTasks(userId);
  const task = tasks[index - 1];

  if (!task) {
    await ctx.reply(`לא נמצאה משימה מספר ${index}. שלחי /tasks לרשימה.`);
    return;
  }

  await completeTask(task.id, userId);
  await ctx.reply(`🎉 כל הכבוד! סימנת כהושלם: "${task.title}"`);
}
