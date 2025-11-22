// Lightweight rolling history store per chat.
class HistoryStore {
  constructor(maxMessages = 6) {
    this.maxMessages = maxMessages;
    this.store = new Map();
  }

  addMessage(chatId, role, content) {
    if (!chatId || !role || !content) return;
    const history = this.store.get(chatId) || [];
    history.push({ role, content });
    if (history.length > this.maxMessages) {
      history.splice(0, history.length - this.maxMessages);
    }
    this.store.set(chatId, history);
  }

  getHistory(chatId) {
    return this.store.get(chatId) || [];
  }
}

module.exports = { HistoryStore };
