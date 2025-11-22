// Main entry to bridge WhatsApp and OpenAI with reminder support.
process.env.TZ = process.env.TZ || 'Asia/Jakarta';
require('dotenv').config();

const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const crypto = require('crypto');
const { HistoryStore } = require('./src/history');
const { getAssistantReply } = require('./src/openai');
const {
  parseReminder,
  loadReminders,
  saveReminders,
  scheduleReminder,
} = require('./src/reminder');

const GROUP_NAME = process.env.GROUP_NAME;
const MAX_HISTORY = Number(process.env.MAX_HISTORY || 6);
const REMINDERS_PATH = process.env.REMINDERS_PATH || './data/reminders.json';
const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;

if (!process.env.OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY is missing. Set it in .env before running.');
}

if (!GROUP_NAME) {
  console.warn('Warning: GROUP_NAME is missing. Set it in .env to target the correct group.');
}

const historyStore = new HistoryStore(MAX_HISTORY);
let targetChatId = null;
let reminders = loadReminders(REMINDERS_PATH);
const processedMessageIds = new Set();

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    ...(PUPPETEER_EXECUTABLE_PATH ? { executablePath: PUPPETEER_EXECUTABLE_PATH } : {}),
  },
});

client.on('qr', (qr) => {
  console.log('Scan this QR with WhatsApp to login:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('WhatsApp client ready. Searching for group:', GROUP_NAME);
  await locateGroup();
  rescheduleLoadedReminders();
  console.log('Listening for messages...');
});

client.on('message', async (message) => {
  await handleIncoming(message, 'message');
});

client.on('message_create', async (message) => {
  await handleIncoming(message, 'message_create');
});

async function handleIncoming(message, source) {
  const chatId = message.fromMe ? message.to : message.from;
  console.log(
    '[message]',
    source,
    'chatId:',
    chatId,
    'from:',
    message.from,
    'to:',
    message.to,
    'body:',
    JSON.stringify(message.body),
    'fromMe:',
    message.fromMe
  );

  if (message.fromMe) {
    console.log('[message] skipped: from self');
    return;
  }

  if (processedMessageIds.has(message.id._serialized)) {
    console.log('[message] skipped: already processed');
    return;
  }

  processedMessageIds.add(message.id._serialized);

  if (!targetChatId || chatId !== targetChatId) {
    console.log('[message] skipped: not target group');
    return;
  }

  const text = (message.body || '').trim();
  if (!text) {
    console.log('[message] skipped: empty text');
    return;
  }

  const reminderResult = parseReminder(text);
  if (reminderResult) {
    if (reminderResult.error) {
      const sent = await message.reply(
        `${reminderResult.error}\nContoh: "ingatkan saya besok jam 8 pagi olahraga" atau "remind me tomorrow 8pm call mom".`
      );
      return;
    }

    const when = reminderResult.when;
    if (when.getTime() <= Date.now()) {
      await message.reply('Waktu pengingat sudah lewat. Tolong kirim ulang dengan waktu yang lebih jelas.');
      return;
    }

    const reminder = {
      id: crypto.randomUUID(),
      chatId: message.from,
      when: when.toISOString(),
      note: reminderResult.note,
    };

    reminders.push(reminder);
    persistReminders();
    scheduleReminder(reminder, sendReminderMessage, () => removeReminder(reminder.id));

    const timeLabel = formatDateTime(when);
    const sent = await message.reply(`Siap, akan diingatkan pada ${timeLabel}.`);
    return;
  }

  // Fallback to Q&A with OpenAI
  try {
    const history = historyStore.getHistory(message.from);
    historyStore.addMessage(message.from, 'user', text);
    const reply = await getAssistantReply({
      chatId: message.from,
      text,
      history,
    });
    const sent = await message.reply(reply);
    historyStore.addMessage(message.from, 'assistant', reply);
  } catch (err) {
    console.error('Error handling message:', err);
    const sent = await message.reply('Maaf, terjadi error saat memproses pesan.');
  }
}

client.initialize();

async function locateGroup() {
  try {
    const chats = await client.getChats();
    const target = chats.find((c) => c.isGroup && c.name === GROUP_NAME);
    if (!target) {
      console.warn(`Group "${GROUP_NAME}" tidak ditemukan. Pastikan sudah dibuat dan nama tepat.`);
      return;
    }
    targetChatId = target.id._serialized;
    console.log('Target group found:', GROUP_NAME, targetChatId);
  } catch (err) {
    console.error('Failed to locate group:', err);
  }
}

function rescheduleLoadedReminders() {
  reminders
    .filter((r) => new Date(r.when).getTime() > Date.now())
    .forEach((reminder) => {
      scheduleReminder(reminder, sendReminderMessage, () => removeReminder(reminder.id));
    });
}

function sendReminderMessage(reminder) {
  const label = formatDateTime(new Date(reminder.when));
  const text = `⏰ Pengingat (${label}): ${reminder.note}`;
  return client.sendMessage(reminder.chatId, text);
}

function removeReminder(reminderId) {
  reminders = reminders.filter((r) => r.id !== reminderId);
  persistReminders();
}

function persistReminders() {
  saveReminders(reminders, REMINDERS_PATH);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
