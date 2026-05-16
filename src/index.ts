import { connectDB } from './db';
import { runMigrations } from './db/migrate';
import { bot } from './bot';
import { startReminderPoller, startReminderWorker, startMorningDigestPoller, startRecurringReminderPoller } from './scheduler';
import { config } from './config';

async function main() {
  console.log('🚀 Starting Pregnancy Tracker Bot...');

  // Database
  await connectDB();
  await runMigrations();

  // Reminders
  startReminderWorker();
  await startReminderPoller();
  await startMorningDigestPoller();
  await startRecurringReminderPoller();

  // Telegram bot
  await bot.launch();
  console.log('✅ Bot is running');

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
