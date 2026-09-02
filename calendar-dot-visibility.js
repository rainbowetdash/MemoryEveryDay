(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CalendarDotVisibility = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function pad(value) { return String(value).padStart(2, '0'); }

  function dateKey(value) {
    if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  function occurrenceEndAt(event, occurrenceDate) {
    const key = dateKey(occurrenceDate || event?.date), time = String(event?.endTime || event?.time || '');
    const dateMatch = key.match(/^(\d{4})-(\d{2})-(\d{2})$/), timeMatch = time.match(/^(\d{1,2}):([0-5]\d)/);
    if (!dateMatch || !timeMatch) return null;
    const hours = Number(timeMatch[1]), minutes = Number(timeMatch[2]);
    if (hours > 24) return null;
    const nextDay = hours === 24;
    return new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]) + (nextDay ? 1 : 0), nextDay ? 0 : hours, minutes);
  }

  function shouldShowEventDot(event, occurrenceDate, now = new Date()) {
    if (event?.kind === 'todo') return !Boolean(event.completedAt);
    const endAt = occurrenceEndAt(event, occurrenceDate);
    return endAt ? endAt > now : true;
  }

  function visibleEvents(events, occurrenceDate, now = new Date()) {
    return (Array.isArray(events) ? events : []).filter((event) => shouldShowEventDot(event, occurrenceDate, now));
  }

  return { occurrenceEndAt, shouldShowEventDot, visibleEvents };
});
