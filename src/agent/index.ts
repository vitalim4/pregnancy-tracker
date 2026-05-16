import Anthropic from '@anthropic-ai/sdk';
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

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

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

const tools: Anthropic.Tool[] = [
  {
    name: 'create_reminder',
    description: 'Create a one-time reminder at a specific date and time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Short reminder title' },
        iso_datetime: { type: 'string', description: 'ISO 8601 datetime in UTC with Z suffix, e.g. 2025-03-20T07:00:00Z. The system prompt shows the current UTC time — add the requested offset to compute this value.' },
      },
      required: ['title', 'iso_datetime'],
    },
  },
  {
    name: 'add_task',
    description: 'Add a task to the user\'s task list.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Task title' },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_tasks',
    description: 'Get the user\'s open task list.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done by its number in the list.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_number: { type: 'number', description: '1-based task number from the list' },
      },
      required: ['task_number'],
    },
  },
  {
    name: 'set_morning_digest',
    description: 'Enable or disable the daily morning message with task list and baby update.',
    input_schema: {
      type: 'object' as const,
      properties: {
        enabled: { type: 'boolean', description: 'true to enable, false to disable' },
        hour: { type: 'number', description: 'Hour of day (0-23) to send the morning message. Default 8.' },
      },
      required: ['enabled'],
    },
  },
  {
    name: 'list_reminders',
    description: 'List all upcoming one-time reminders for the user.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'cancel_reminder',
    description: 'Cancel a one-time reminder by its number from the list.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reminder_number: { type: 'number', description: '1-based number from the list' },
      },
      required: ['reminder_number'],
    },
  },
  {
    name: 'create_recurring_reminder',
    description: 'Create a repeating reminder that fires every N minutes. Use for "every hour", "every day", "every 2 hours" etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Reminder text, e.g. "שתי מים"' },
        interval_minutes: { type: 'number', description: 'How often to repeat in minutes. 60=hourly, 120=every 2h, 1440=daily' },
      },
      required: ['title', 'interval_minutes'],
    },
  },
  {
    name: 'list_recurring_reminders',
    description: 'List all active recurring reminders for the user.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'delete_recurring_reminder',
    description: 'Stop/delete a recurring reminder by its number from the list.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reminder_number: { type: 'number', description: '1-based number from the list' },
      },
      required: ['reminder_number'],
    },
  },
  {
    name: 'update_pregnancy_date',
    description: 'Update the LMP (last menstrual period) date of the pregnancy. Use this when the user wants to correct or change their pregnancy start date or due date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lmp_date: { type: 'string', description: 'The new LMP date in ISO format YYYY-MM-DD, e.g. 2025-08-01' },
      },
      required: ['lmp_date'],
    },
  },
  {
    name: 'get_tests_status',
    description: 'Get the list of pregnancy tests relevant to the current week, showing which are done and which are pending.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'mark_test_done',
    description: 'Mark a pregnancy test as completed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        test_id: { type: 'string', description: `The test ID. Available: ${PREGNANCY_TESTS.map(t => t.id).join(', ')}` },
        notes: { type: 'string', description: 'Optional notes (e.g. result, date)' },
      },
      required: ['test_id'],
    },
  },
  {
    name: 'unmark_test_done',
    description: 'Mark a pregnancy test as not done (undo).',
    input_schema: {
      type: 'object' as const,
      properties: {
        test_id: { type: 'string', description: `The test ID. Available: ${PREGNANCY_TESTS.map(t => t.id).join(', ')}` },
      },
      required: ['test_id'],
    },
  },
];

async function runTool(name: string, input: Record<string, any>, userId: number): Promise<{ content: string; reminder?: { title: string; remindAt: Date } }> {
  if (name === 'create_reminder') {
    const remindAt = new Date(input.iso_datetime);
    if (isNaN(remindAt.getTime()) || remindAt <= new Date()) {
      return { content: 'error: invalid or past date' };
    }
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
    const list = tasks.map((t: any, i: number) => `${i + 1}. ${t.title}`).join('\n');
    return { content: list };
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

  if (name === 'get_tests_status') {
    const pregnancy = await getActivePregnancy(userId);
    if (!pregnancy) return { content: 'no active pregnancy' };
    const week = getCurrentWeek(new Date(pregnancy.lmp_date));
    const upcoming = getUpcomingTests(week);
    const done = await getCompletedTests(userId);
    if (upcoming.length === 0) return { content: 'no tests relevant for current week' };
    const lines = upcoming.map((t) => {
      const status = done.includes(t.id) ? '✅' : '⏳';
      return `${status} ${t.name} (שבוע ${t.weekFrom}–${t.weekTo}): ${t.description}`;
    });
    return { content: lines.join('\n') };
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

  if (name === 'list_reminders') {
    const reminders = await getReminders(userId);
    if (reminders.length === 0) return { content: 'no upcoming reminders' };
    const lines = reminders.map((r: any, i: number) => {
      const dt = new Date(r.remind_at).toLocaleString('he-IL');
      return `${i + 1}. ${r.title} – ${dt}`;
    });
    return { content: lines.join('\n') };
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
    const lines = reminders.map((r: any, i: number) => {
      const hours = r.interval_minutes >= 60 ? `כל ${r.interval_minutes / 60} שעות` : `כל ${r.interval_minutes} דקות`;
      return `${i + 1}. ${r.title} – ${hours}`;
    });
    return { content: lines.join('\n') };
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
    if (isNaN(lmpDate.getTime()) || lmpDate > new Date()) {
      return { content: 'error: invalid date' };
    }
    await updatePregnancyLmp(userId, lmpDate);
    return { content: 'success' };
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

  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  let createdReminder: { title: string; remindAt: Date } | undefined;

  // Agentic loop — keep running until no more tool calls
  let response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    system: systemPrompt,
    tools,
    messages,
  });

  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      const result = await runTool(toolUse.name, toolUse.input as Record<string, any>, ctx.userId);
      if (result.reminder) createdReminder = result.reminder;
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result.content });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });
  }

  const assistantMessage = response.content.find((b) => b.type === 'text')?.text ?? '';
  if (assistantMessage) {
    await saveMessage(ctx.userId, 'assistant', assistantMessage);
  }
  return { message: assistantMessage, reminder: createdReminder };
}
