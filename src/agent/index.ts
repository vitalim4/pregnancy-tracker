import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { config } from '../config';
import { buildSystemPrompt } from './systemPrompt';
import {
  getHistory, saveMessage,
  createReminder, getActivePregnancy, getCurrentWeek,
  getTasks, createTask, completeTask,
  setMorningDigest, updatePregnancyLmp,
  getCompletedTests, markTestCompleted, unmarkTestCompleted,
  createRecurringReminder, getRecurringReminders, deleteRecurringReminder,
  getReminders, cancelReminder,
} from '../db/queries';
import { PREGNANCY_TESTS, getUpcomingTests, getTestById } from '../content/pregnancyTests';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

interface AgentContext {
  userId: number;
  currentWeek?: number;
  dueDate?: string;
  babyNickname?: string;
}

export interface ChatResult {
  message: string;
  reminder?: { title: string; remindAt: Date };
}

const tools: FunctionDeclaration[] = [
  {
    name: 'create_reminder',
    description: 'Create a one-time reminder at a specific date and time.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: 'Short reminder title' },
        iso_datetime: { type: SchemaType.STRING, description: 'ISO 8601 datetime in UTC with Z suffix, e.g. 2025-03-20T07:00:00Z. The system prompt shows the current UTC time — add the requested offset to compute this value.' },
      },
      required: ['title', 'iso_datetime'],
    },
  },
  {
    name: 'add_task',
    description: "Add a task to the user's task list.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { title: { type: SchemaType.STRING, description: 'Task title' } },
      required: ['title'],
    },
  },
  {
    name: 'get_tasks',
    description: "Get the user's open task list.",
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done by its number in the list.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { task_number: { type: SchemaType.NUMBER, description: '1-based task number from the list' } },
      required: ['task_number'],
    },
  },
  {
    name: 'set_morning_digest',
    description: 'Enable or disable the daily morning message with task list and baby update.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        enabled: { type: SchemaType.BOOLEAN, description: 'true to enable, false to disable' },
        hour: { type: SchemaType.NUMBER, description: 'Hour of day (0-23). Default 8.' },
      },
      required: ['enabled'],
    },
  },
  {
    name: 'list_reminders',
    description: 'List all upcoming one-time reminders for the user.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'cancel_reminder',
    description: 'Cancel a one-time reminder by its number from the list.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { reminder_number: { type: SchemaType.NUMBER, description: '1-based number from the list' } },
      required: ['reminder_number'],
    },
  },
  {
    name: 'create_recurring_reminder',
    description: 'Create a repeating reminder that fires every N minutes.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: 'Reminder text' },
        interval_minutes: { type: SchemaType.NUMBER, description: 'How often to repeat in minutes. 60=hourly, 1440=daily' },
      },
      required: ['title', 'interval_minutes'],
    },
  },
  {
    name: 'list_recurring_reminders',
    description: 'List all active recurring reminders for the user.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'delete_recurring_reminder',
    description: 'Stop/delete a recurring reminder by its number from the list.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { reminder_number: { type: SchemaType.NUMBER, description: '1-based number from the list' } },
      required: ['reminder_number'],
    },
  },
  {
    name: 'update_pregnancy_date',
    description: 'Update the LMP date of the pregnancy.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { lmp_date: { type: SchemaType.STRING, description: 'New LMP date in YYYY-MM-DD format' } },
      required: ['lmp_date'],
    },
  },
  {
    name: 'get_tests_status',
    description: 'Get pregnancy tests relevant to the current week.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'mark_test_done',
    description: 'Mark a pregnancy test as completed.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        test_id: { type: SchemaType.STRING, description: `Test ID. Available: ${PREGNANCY_TESTS.map(t => t.id).join(', ')}` },
        notes: { type: SchemaType.STRING, description: 'Optional notes' },
      },
      required: ['test_id'],
    },
  },
  {
    name: 'unmark_test_done',
    description: 'Mark a pregnancy test as not done (undo).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        test_id: { type: SchemaType.STRING, description: `Test ID. Available: ${PREGNANCY_TESTS.map(t => t.id).join(', ')}` },
      },
      required: ['test_id'],
    },
  },
];

async function runTool(name: string, input: Record<string, any>, userId: number): Promise<{ content: string; reminder?: { title: string; remindAt: Date } }> {
  if (name === 'create_reminder') {
    const remindAt = new Date(input.iso_datetime);
    if (isNaN(remindAt.getTime()) || remindAt <= new Date()) return { content: 'error: invalid or past date' };
    const pregnancy = await getActivePregnancy(userId);
    await createReminder(userId, pregnancy?.id, input.title, remindAt);
    return { content: 'success', reminder: { title: input.title, remindAt } };
  }
  if (name === 'add_task') {
    const pregnancy = await getActivePregnancy(userId);
    await createTask(userId, pregnancy?.id, input.title);
    return { content: 'success' };
  }
  if (name === 'get_tasks') {
    const tasks = await getTasks(userId);
    if (tasks.length === 0) return { content: 'no open tasks' };
    return { content: tasks.map((t: any, i: number) => `${i + 1}. ${t.title}`).join('\n') };
  }
  if (name === 'complete_task') {
    const tasks = await getTasks(userId);
    const task = tasks[input.task_number - 1];
    if (!task) return { content: `error: task ${input.task_number} not found` };
    await completeTask(task.id, userId);
    return { content: `completed: ${task.title}` };
  }
  if (name === 'set_morning_digest') {
    await setMorningDigest(userId, input.enabled, input.hour ?? 8);
    return { content: 'success' };
  }
  if (name === 'list_reminders') {
    const reminders = await getReminders(userId);
    if (reminders.length === 0) return { content: 'no upcoming reminders' };
    return { content: reminders.map((r: any, i: number) => `${i + 1}. ${r.title} – ${new Date(r.remind_at).toLocaleString('he-IL')}`).join('\n') };
  }
  if (name === 'cancel_reminder') {
    const reminders = await getReminders(userId);
    const reminder = reminders[input.reminder_number - 1];
    if (!reminder) return { content: `error: reminder ${input.reminder_number} not found` };
    await cancelReminder(reminder.id, userId);
    return { content: `cancelled: ${reminder.title}` };
  }
  if (name === 'create_recurring_reminder') {
    if (input.interval_minutes < 30) return { content: 'error: minimum interval is 30 minutes' };
    await createRecurringReminder(userId, input.title, input.interval_minutes);
    return { content: 'success' };
  }
  if (name === 'list_recurring_reminders') {
    const reminders = await getRecurringReminders(userId);
    if (reminders.length === 0) return { content: 'no recurring reminders' };
    return { content: reminders.map((r: any, i: number) => `${i + 1}. ${r.title} – כל ${r.interval_minutes >= 60 ? r.interval_minutes / 60 + ' שעות' : r.interval_minutes + ' דקות'}`).join('\n') };
  }
  if (name === 'delete_recurring_reminder') {
    const reminders = await getRecurringReminders(userId);
    const reminder = reminders[input.reminder_number - 1];
    if (!reminder) return { content: `error: reminder ${input.reminder_number} not found` };
    await deleteRecurringReminder(reminder.id, userId);
    return { content: `deleted: ${reminder.title}` };
  }
  if (name === 'update_pregnancy_date') {
    const lmpDate = new Date(input.lmp_date);
    if (isNaN(lmpDate.getTime()) || lmpDate > new Date()) return { content: 'error: invalid date' };
    await updatePregnancyLmp(userId, lmpDate);
    return { content: 'success' };
  }
  if (name === 'get_tests_status') {
    const pregnancy = await getActivePregnancy(userId);
    if (!pregnancy) return { content: 'no active pregnancy' };
    const week = getCurrentWeek(new Date(pregnancy.lmp_date));
    const upcoming = getUpcomingTests(week);
    const done = await getCompletedTests(userId);
    if (upcoming.length === 0) return { content: 'no tests relevant for current week' };
    return { content: upcoming.map(t => `${done.includes(t.id) ? '✅' : '⏳'} ${t.name} (שבוע ${t.weekFrom}–${t.weekTo}): ${t.description}`).join('\n') };
  }
  if (name === 'mark_test_done') {
    const test = getTestById(input.test_id);
    if (!test) return { content: `error: unknown test_id "${input.test_id}"` };
    await markTestCompleted(userId, input.test_id, input.notes);
    return { content: `marked done: ${test.name}` };
  }
  if (name === 'unmark_test_done') {
    const test = getTestById(input.test_id);
    if (!test) return { content: `error: unknown test_id "${input.test_id}"` };
    await unmarkTestCompleted(userId, input.test_id);
    return { content: `unmarked: ${test.name}` };
  }
  return { content: 'unknown tool' };
}

export async function chat(userMessage: string, ctx: AgentContext): Promise<ChatResult> {
  await saveMessage(ctx.userId, 'user', userMessage);

  const history = await getHistory(ctx.userId);
  const systemPrompt = buildSystemPrompt({
    currentWeek: ctx.currentWeek,
    dueDate: ctx.dueDate,
    babyNickname: ctx.babyNickname,
  });

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations: tools }],
  });

  const geminiHistory = history.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history: geminiHistory });

  let createdReminder: { title: string; remindAt: Date } | undefined;
  let result = await chat.sendMessage(userMessage);

  // Agentic loop
  while (true) {
    const calls = result.response.functionCalls();
    if (!calls || calls.length === 0) break;

    const toolResults = [];
    for (const call of calls) {
      const res = await runTool(call.name, call.args as Record<string, any>, ctx.userId);
      if (res.reminder) createdReminder = res.reminder;
      toolResults.push({ functionResponse: { name: call.name, response: { result: res.content } } });
    }

    result = await chat.sendMessage(toolResults);
  }

  const assistantMessage = result.response.text();
  if (assistantMessage) await saveMessage(ctx.userId, 'assistant', assistantMessage);
  return { message: assistantMessage, reminder: createdReminder };
}
