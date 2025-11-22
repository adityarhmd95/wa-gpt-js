const fs = require('fs');
const path = require('path');
const chrono = require('chrono-node');
const schedule = require('node-schedule');

const TZ = 'Asia/Jakarta';
process.env.TZ = process.env.TZ || TZ;

const scheduledJobs = new Map();

function parseReminder(text) {
  if (!text) return null;
  const normalized = text.trim().toLowerCase();
  const prefixes = ['ingatkan saya', 'remind me', 'reminder'];
  const matched = prefixes.find((prefix) => normalized.startsWith(prefix));
  if (!matched) return null;

  const remainder = text.trim().slice(matched.length).trim();
  if (!remainder) {
    return { error: 'Format pengingat kurang jelas.' };
  }

  const parsed = chrono.parse(remainder, new Date(), { forwardDate: true });
  if (!parsed.length) {
    return { error: 'Tidak bisa mengenali waktu pengingat.' };
  }

  const result = parsed[0];
  const when = toTimeZone(result.date(), TZ);
  const noteRaw = remainder.replace(result.text, '').trim();
  const note = noteRaw || 'Pengingat';

  return { when, note };
}

function loadReminders(filePath) {
  const resolved = path.resolve(filePath);
  ensureFile(resolved);
  try {
    const data = fs.readFileSync(resolved, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Failed to load reminders, starting fresh:', err);
    return [];
  }
}

function saveReminders(reminders, filePath) {
  const resolved = path.resolve(filePath);
  ensureDir(path.dirname(resolved));
  fs.writeFileSync(resolved, JSON.stringify(reminders, null, 2));
}

function scheduleReminder(reminder, sendFn, onRemove) {
  if (!reminder || !reminder.id || !reminder.when || !sendFn) return;
  if (scheduledJobs.has(reminder.id)) return;

  const when = new Date(reminder.when);
  if (when.getTime() <= Date.now()) return;

  const job = schedule.scheduleJob(when, async () => {
    try {
      await sendFn(reminder);
    } catch (err) {
      console.error('Failed to deliver reminder:', err);
    } finally {
      scheduledJobs.delete(reminder.id);
      if (onRemove) onRemove(reminder.id);
    }
  });

  if (job) {
    scheduledJobs.set(reminder.id, job);
  }
}

function ensureFile(filePath) {
  ensureDir(path.dirname(filePath));
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]');
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function toTimeZone(date, timeZone) {
  // Create a Date representing the same wall-clock time in the target timezone.
  const localeString = date.toLocaleString('en-US', {
    timeZone,
    hour12: false,
  });
  return new Date(localeString);
}

module.exports = {
  parseReminder,
  loadReminders,
  saveReminders,
  scheduleReminder,
};
