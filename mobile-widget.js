(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MemoryWidgetSnapshot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function key(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function build(events, signedIn, occursOn, now = new Date()) {
    if (!signedIn) return { version: 1, updatedAt: now.getTime(), signedIn: false, days: [] };
    const first = new Date(now.getFullYear(), now.getMonth(), 1, 12);
    first.setDate(1 - first.getDay());
    const days = Array.from({ length: 98 }, (_, offset) => {
      const date = new Date(first); date.setDate(first.getDate() + offset);
      const dateKey = key(date);
      const items = events.filter((event) => !(event.kind === 'todo' && event.completedAt) && occursOn(event, date))
        .sort((a, b) => String(a.time).localeCompare(String(b.time))).map((event) => {
          const time = /^\d{2}:[0-5]\d$/.test(event.time || '') ? event.time : '09:00';
          const endTime = /^\d{2}:[0-5]\d$/.test(event.endTime || '') ? event.endTime : '';
          const [h, m] = (endTime || time).split(':').map(Number);
          return { id: String(event.id), title: String(event.title || '未命名安排').slice(0, 160), time, endTime,
            color: String(event.color || 'blue'), todo: event.kind === 'todo',
            endsAt: new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m).getTime() };
        });
      return { date: dateKey, items };
    });
    return { version: 1, updatedAt: now.getTime(), signedIn: true, days };
  }
  return { build };
});
