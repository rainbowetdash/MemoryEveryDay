(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TodoPlanning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const pending = item => item?.kind === 'todo' && !item.date;
  function day(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return null;
    const parts = match.slice(1).map(Number), date = new Date(Date.UTC(parts[0], parts[1]-1, parts[2]));
    return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1]-1 && date.getUTCDate() === parts[2] ? date.getTime()/86400000 : null;
  }
  function due(item, now = new Date()) {
    if (item?.kind !== 'todo' || !item.dueDate) return null;
    const target = day(item.dueDate); if (target === null) return null;
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())/86400000, days = target-today;
    const label = item.completedAt ? `${item.dueDate} 截止` : days < 0 ? `已逾期 ${-days} 天` : days === 0 ? '今天截止' : days === 1 ? '明天截止' : `${item.dueDate.slice(5).replace('-', '/')} 截止`;
    return {days, label, tone: item.completedAt ? 'done' : days < 0 ? 'overdue' : days <= 2 ? 'soon' : 'later'};
  }
  function sort(items) {
    return [...items].sort((a,b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31') || Number(pending(b))-Number(pending(a)) || a.title.localeCompare(b.title,'zh-CN'));
  }
  return {pending, due, sort, validDate: value => day(value) !== null};
});
