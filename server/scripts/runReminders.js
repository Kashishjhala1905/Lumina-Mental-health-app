#!/usr/bin/env node
// Processes due check-in reminders immediately (same code path as the scheduler).
//   node scripts/runReminders.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const mongoose = require('mongoose');
const { processDueReminders, reminderStats } = require('../services/reminderService');

(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const summary = await processDueReminders();
    console.log('Reminder run   :', JSON.stringify(summary));
    console.log('Last 30 days   :', JSON.stringify(await reminderStats(30)));
    await mongoose.disconnect();
})().catch(async (err) => { console.error('Reminder run failed:', err.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
