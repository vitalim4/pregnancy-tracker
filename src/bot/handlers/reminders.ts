import { Context } from 'telegraf';
import { getReminders, createReminder, getActivePregnancy, setMorningDigest } from '../../db/queries';
import { format, parse } from 'date-fns';
import { createEvent } from 'ics';

export async function handleReminders(ctx: Context) {
  const userId = ctx.from!.id;
  const reminders = await getReminders(userId);

  if (reminders.length === 0) {
    await ctx.reply(
      '🔔 אין לך תזכורות פעילות.\n\nכדי להוסיף תזכורת שלחי:\n/remind DD/MM/YYYY HH:MM כותרת\nלדוגמה: /remind 20/03/2025 10:00 בדיקת אולטרסאונד',
    );
    return;
  }

  const lines = reminders.map((r: any) => {
    const dt = format(new Date(r.remind_at), 'dd/MM/yyyy HH:mm');
    return `🔔 ${dt} – ${r.title}`;
  });

  await ctx.reply(`📅 *התזכורות שלך:*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
}

export async function handleAddReminder(ctx: Context) {
  const userId = ctx.from!.id;
  const text = (ctx.message as any)?.text ?? '';
  // Format: /remind DD/MM/YYYY HH:MM title
  const match = text.match(/^\/remind\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+(.+)$/i);

  if (!match) {
    await ctx.reply(
      'פורמט שגוי. שלחי:\n/remind DD/MM/YYYY HH:MM כותרת\nלדוגמה:\n/remind 20/03/2025 10:00 בדיקת אולטרסאונד',
    );
    return;
  }

  const [, dateStr, timeStr, title] = match;
  const remindAt = parse(`${dateStr} ${timeStr}`, 'dd/MM/yyyy HH:mm', new Date());

  if (isNaN(remindAt.getTime()) || remindAt <= new Date()) {
    await ctx.reply('התאריך שגוי או כבר עבר. אנא בדקי שוב.');
    return;
  }

  const pregnancy = await getActivePregnancy(userId);
  await createReminder(userId, pregnancy?.id, title, remindAt);

  const formatted = format(remindAt, 'dd/MM/yyyy HH:mm');
  await ctx.reply(`✅ תזכורת נוצרה!\n🔔 ${formatted} – ${title}`);
  await sendCalendarLinks(ctx, title, remindAt);
}

export async function handleMorningDigest(ctx: Context) {
  const userId = ctx.from!.id;
  const text = (ctx.message as any)?.text ?? '';
  const arg = text.replace(/^\/morning\s*/i, '').trim().toLowerCase();

  if (arg === 'off') {
    await setMorningDigest(userId, false);
    await ctx.reply('🔕 תזכורת בוקר כובתה. שלחי /morning on להפעלה מחדש.');
    return;
  }

  // Default: enable at 8 AM (or parse custom hour like "on 9")
  let hour = 8;
  const hourMatch = arg.match(/^on\s+(\d{1,2})$/) ?? arg.match(/^(\d{1,2})$/);
  if (hourMatch) hour = parseInt(hourMatch[1], 10);

  if (hour < 0 || hour > 23) {
    await ctx.reply('שעה לא תקינה. לדוגמה: /morning on 7 (לשעה 7:00 בבוקר)');
    return;
  }

  await setMorningDigest(userId, true, hour);
  await ctx.reply(
    `✅ תזכורת בוקר הופעלה!\nכל יום בשעה *${hour}:00* אשלח לך את רשימת המשימות הפתוחות.\n\nלכיבוי: /morning off`,
    { parse_mode: 'Markdown' },
  );
}

export async function sendCalendarLinks(ctx: Context, title: string, date: Date): Promise<void> {
  try {
    const googleUrl = buildGoogleCalendarUrl(title, date);
    await ctx.reply(
      `📅 להוספה ליומן Google Calendar – לחצי על הקישור:\n${googleUrl}\n\n🍎 משתמשת Apple? קבלי את הקובץ למטה`,
      { disable_web_page_preview: true } as any,
    );
  } catch (err) {
    console.error('Failed to send Google Calendar link:', err);
  }

  try {
    const icsBuffer = buildIcs(title, date);
    if (icsBuffer) {
      await ctx.replyWithDocument(
        { source: icsBuffer, filename: 'reminder.ics' },
        { caption: '🍎 לחצי כדי להוסיף ל-Apple Calendar' },
      );
    }
  } catch (err) {
    console.error('Failed to send ICS file:', err);
  }
}

function buildGoogleCalendarUrl(title: string, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

  const end = new Date(date.getTime() + 60 * 60 * 1000); // +1 hour
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(date)}/${fmt(end)}`,
    ctz: 'Asia/Jerusalem',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildIcs(title: string, date: Date): Buffer | null {
  const { error, value } = createEvent({
    title,
    method: 'PUBLISH',
    start: [
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
    ],
    startInputType: 'local',
    duration: { hours: 1 },
    alarms: [{ action: 'display', description: title, trigger: { minutes: 30, before: true } }],
  });

  if (error || !value) {
    console.error('ICS creation error:', error);
    return null;
  }
  return Buffer.from(value);
}
