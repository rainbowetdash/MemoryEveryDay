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
  // A deadline gives an unplanned todo a day in the calendar, not an execution time.
  function occursOn(item, key) {
    if (item?.kind !== 'todo') return false;
    if (item.date) return item.date === key;
    return !item.completedAt && day(item.dueDate) !== null && item.dueDate === key;
  }
  function due(item, now = new Date()) {
    if (item?.kind !== 'todo' || !item.dueDate) return null;
    const target = day(item.dueDate); if (target === null) return null;
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())/86400000, days = target-today;
    const label = item.completedAt ? `${item.dueDate} 截止` : days < 0 ? `已逾期 ${-days} 天` : days === 0 ? '今天截止' : days === 1 ? '明天截止' : `${item.dueDate.slice(5).replace('-', '/')} 截止`;
    return {days, label, tone: item.completedAt ? 'done' : days < 0 ? 'overdue' : days <= 2 ? 'soon' : 'later'};
  }
  const quadrants = [
    {id:'do',label:'重要 · 紧急',hint:'优先处理'},
    {id:'plan',label:'重要 · 不紧急',hint:'留出时间'},
    {id:'soon',label:'不重要 · 紧急',hint:'尽快处理'},
    {id:'later',label:'不重要 · 不紧急',hint:'有空再做'}
  ];
  function priority(item, now = new Date()) {
    const deadline = due(item, now), urgent = Boolean(deadline && deadline.days <= 2);
    return item.important ? (urgent ? 0 : 1) : (urgent ? 2 : 3);
  }
  function sort(items, mode = 'due', now = new Date()) {
    const deadline = item => day(item.dueDate) === null ? '9999-12-31' : item.dueDate;
    return [...items].sort((a,b) => (mode === 'priority' ? priority(a,now)-priority(b,now) : 0)
      || deadline(a).localeCompare(deadline(b)) || Number(Boolean(b.important))-Number(Boolean(a.important))
      || Number(pending(b))-Number(pending(a)) || a.title.localeCompare(b.title,'zh-CN') || String(a.id).localeCompare(String(b.id)));
  }
  return {pending, occursOn, due, sort, priority, quadrants, validDate: value => day(value) !== null};
});
