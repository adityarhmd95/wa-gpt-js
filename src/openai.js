const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PRIMARY_MODEL = process.env.OPENAI_MODEL || 'gpt-5-nano';
const FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini';

const systemPrompt =
  'You are a concise, friendly assistant. Answer in the same language as the user, keep replies short and clear. Avoid speculation and keep formatting simple.';

async function getAssistantReply({ chatId, text, history = [] }) {
  const baseMessages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: text },
  ];

  const primary = await requestOnce({
    model: PRIMARY_MODEL,
    messages: baseMessages,
    max_completion_tokens: 200,
  });
  if (primary) return primary;

  // Retry with shorter context on the primary model.
  const primaryShort = await requestOnce({
    model: PRIMARY_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    max_completion_tokens: 120,
  });
  if (primaryShort) return primaryShort;

  // Final fallback to a broadly compatible model.
  const fallback = await requestOnce({
    model: FALLBACK_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    max_tokens: 200,
  });

  return fallback || 'Maaf, aku tidak mendapat jawaban. Bisa kirim ulang dengan kalimat lain?';
}

function extractContent(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((part) => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (typeof part.text === 'string') return part.text;
        if (part.text && typeof part.text.value === 'string') return part.text.value;
        if (part.type === 'output_text' && part.text) return String(part.text);
        return '';
      })
      .join(' ')
      .trim();
  }
  if (raw.text) {
    if (typeof raw.text === 'string') return raw.text;
    if (typeof raw.text.value === 'string') return raw.text.value;
  }
  return '';
}

async function requestOnce(params) {
  try {
    const response = await client.chat.completions.create(params);
    const raw = response.choices?.[0]?.message?.content;
    const choice = extractContent(raw);
    if (!choice) {
      console.error('OpenAI returned empty content', JSON.stringify(response, null, 2));
      return '';
    }
    return choice.trim();
  } catch (err) {
    console.error('OpenAI request failed:', err);
    return '';
  }
}

module.exports = { getAssistantReply };
