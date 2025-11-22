# WhatsApp GPT Assistant

Turn your personal WhatsApp account into a GPT-5 Nano powered assistant with reminder support. This project uses the unofficial `whatsapp-web.js` client, so use it at your own risk.

## Setup
- `npm install`
- Create a `.env` file (see config below).
- `npm run dev`
- Scan the QR code with your WhatsApp (first run only).
- Create a WhatsApp group containing only yourself and set `GROUP_NAME` to that exact name.

## .env
```
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-5-nano
GROUP_NAME=My Solo Group
MAX_HISTORY=6
REMINDERS_PATH=./data/reminders.json
```

## Usage
- Q&A: Send any message in the target group; the bot replies with a concise answer in the same language.
- Reminders: Start a message with `ingatkan saya ...`, `remind me ...`, or `reminder ...`
  - Examples:
    - `ingatkan saya sore ini jam 3 ada meeting`
    - `remind me tomorrow 8pm call mom`
  - If parsing fails or the time is in the past, the bot asks for clarification.
  - Reminders persist in `REMINDERS_PATH` and reschedule on restart.

## Notes
- `whatsapp-web.js` is unofficial; WhatsApp could block accounts. Proceed carefully.
- Auth uses local storage via `LocalAuth`; QR scan is typically needed once per machine.
- Timezone is fixed to `Asia/Jakarta` for parsing and formatting.
