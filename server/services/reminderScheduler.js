// reminderScheduler – the single, centralised scheduled job for check-in reminders and data retention.
// Started once by startServer(); never per user. Disabled with REMINDERS_ENABLED=false.
const cron = require('node-cron');
const mongoose = require('mongoose');
const { processDueReminders } = require('./reminderService');
const { purgeExpiredRetainedData } = require('./victimDataService');

let tasks = [];

function startReminderScheduler() {
    if (process.env.REMINDERS_ENABLED === 'false' || tasks.length) return tasks;
    const expression = process.env.REMINDER_CRON || '*/15 * * * *';
    if (!cron.validate(expression)) {
        console.error(`Invalid REMINDER_CRON "${expression}" – reminder scheduler not started`);
        return tasks;
    }

    tasks.push(cron.schedule(expression, async () => {
        if (mongoose.connection.readyState !== 1) return;
        try {
            const summary = await processDueReminders();
            if (summary.due) console.log('⏰ Reminder run:', JSON.stringify(summary));
        } catch (err) {
            console.error('Reminder run failed:', err.message);
        }
    }, { name: 'checkin-reminders', noOverlap: true, timezone: 'UTC' }));

    tasks.push(cron.schedule('30 3 * * *', async () => {
        if (mongoose.connection.readyState !== 1) return;
        try {
            const purged = await purgeExpiredRetainedData();
            if (purged) console.log(`🧹 Retention purge removed data for ${purged} withdrawn case(s)`);
        } catch (err) {
            console.error('Retention purge failed:', err.message);
        }
    }, { name: 'retention-purge', noOverlap: true, timezone: 'UTC' }));

    console.log(`⏰ Reminder scheduler started (${expression}, UTC)`);
    return tasks;
}

function stopReminderScheduler() {
    tasks.forEach((t) => t.stop());
    tasks = [];
}

module.exports = { startReminderScheduler, stopReminderScheduler };
