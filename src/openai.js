const OpenAI = require('openai');

const PRIMARY_MODEL = process.env.OPENAI_MODEL || 'gpt-5.1';
const FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = Number(process.env.OPENAI_MAX_TOKENS || 1000);
const DEFAULT_VERBOSITY = process.env.OPENAI_VERBOSITY || 'high';
const DEFAULT_REASONING = process.env.OPENAI_REASONING_EFFORT || 'high';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const baseSystemPrompt = `
You are a senior software tutor and explainer.
Respond in the user's language. Default to detailed, structured answers with:
- A short definition
- Background/context
- Step-by-step reasoning
- Real-world examples or analogies
- Pros/cons or edge cases when relevant
- Clear section headings and bullets when broad
Use code blocks when technical. Avoid filler. Keep concise only if the user explicitly asks (e.g., "singkat", "short", "brief", "tl;dr").
When asked about your model/version, state the model you are actually running on: "{{MODEL_NAME}}".
`.trim();

function buildSystemPrompt(modelName) {
  return baseSystemPrompt.replace('{{MODEL_NAME}}', modelName);
}

function tokensValue(shortMode) {
  if (shortMode) return Math.max(200, Math.floor(DEFAULT_MAX_TOKENS / 3));
  return DEFAULT_MAX_TOKENS;
}

function verbosityValue(modelName, shortMode) {
  if (!isGpt5(modelName)) return undefined;
  return shortMode ? 'low' : DEFAULT_VERBOSITY;
}

function reasoningValue(modelName, shortMode) {
  if (!isGpt5(modelName)) return undefined;
  return shortMode ? 'low' : DEFAULT_REASONING;
}

function isGpt5(modelName) {
  return typeof modelName === 'string' && modelName.startsWith('gpt-5');
}

async function getAssistantReply({ text, history = [], shortMode = false }) {
  const primaryPrompt = buildSystemPrompt(PRIMARY_MODEL);
  const fallbackPrompt = buildSystemPrompt(FALLBACK_MODEL);

  const primary = await requestOnce({
    model: PRIMARY_MODEL,
    messages: [
      { role: 'system', content: primaryPrompt },
      ...history,
      { role: 'user', content: text },
    ],
    shortMode,
  });
  if (primary) return primary;

  // Retry with shorter context on the primary model.
  const primaryShort = await requestOnce({
    model: PRIMARY_MODEL,
    messages: [
      { role: 'system', content: primaryPrompt },
      { role: 'user', content: text },
    ],
    shortMode,
  });
  if (primaryShort) return primaryShort;

  // Final fallback to a broadly compatible model.
  const fallback = await requestOnce({
    model: FALLBACK_MODEL,
    messages: [
      { role: 'system', content: fallbackPrompt },
      { role: 'user', content: text },
    ],
    shortMode,
    forceCompatibility: true,
  });

  return fallback || 'Maaf, aku tidak mendapat jawaban. Bisa kirim ulang dengan kalimat lain?';
}

async function requestOnce({ model, messages, shortMode, forceCompatibility = false }) {
  const verbosity = verbosityValue(model, shortMode);
  const reasoningEffort = reasoningValue(model, shortMode);
  const maxTokens = tokensValue(shortMode);

  const payload = {
    model,
    input: toResponseInput(messages),
    max_output_tokens: maxTokens,
  };

  const textConfig = { format: { type: 'text' } };
  if (verbosity) textConfig.verbosity = verbosity;
  payload.text = textConfig;

  if (reasoningEffort) payload.reasoning = { effort: reasoningEffort };

  // Temperature is not supported on some GPT-5 response models; only set for compatibility/fallback.
  if (!isGpt5(model) || forceCompatibility) {
    payload.temperature = shortMode ? 0.4 : 0.6;
  }

  try {
    const response = await client.responses.create(payload);
    const choice = extractResponseText(response);
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

function toResponseInput(messages) {
  return messages.map((msg) => ({
    role: msg.role,
    content: [{ type: 'input_text', text: msg.content }],
  }));
}

function extractResponseText(response) {
  if (!response) return '';
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }
  if (Array.isArray(response.output)) {
    const texts = [];
    for (const item of response.output) {
      if (!item?.content) continue;
      for (const part of item.content) {
        if (typeof part?.text === 'string') {
          texts.push(part.text);
        } else if (part?.text?.value) {
          texts.push(part.text.value);
        }
      }
    }
    return texts.join(' ').trim();
  }
  return '';
}

module.exports = { getAssistantReply };
