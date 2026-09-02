(function (root, factory) {
  const api = factory(root?.CalendarReschedule);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DesktopWidgetModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rescheduleApi) {
  function pad(value) { return String(value).padStart(2, '0'); }

  function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function dateFromKey(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function normalizeTime(value, allowEndOfDay = false) {
    const match = String(value || '').match(/^(\d{1,2}):([0-5]\d)/);
    if (!match) return '';
    const hours = Number(match[1]);
    if (hours > 23 && !(allowEndOfDay && hours === 24)) return '';
    return `${pad(hours)}:${match[2]}`;
  }

  function normalizeWeeklyDays(value) {
    return [...new Set((Array.isArray(value) ? value : []).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
  }

  function rowToEvent(row) {
    const kind = row?.item_type === 'todo' ? 'todo' : 'event';
    return {
      id: String(row?.id || ''),
      title: String(row?.title || '未命名安排'),
      note: String(row?.note || '').trim().slice(0, 140),
      kind,
      completedAt: kind === 'todo' ? String(row?.completed_at || '') : '',
      date: String(row?.event_date || ''),
      time: normalizeTime(row?.start_time) || '09:00',
      endTime: normalizeTime(row?.end_time, true),
      color: String(row?.color || 'blue'),
      groupId: String(row?.group_id || 'all'),
      weeklyDays: kind === 'todo' ? [] : normalizeWeeklyDays(row?.repeat_weekdays),
      repeatStartDate: String(row?.repeat_start_date || row?.event_date || ''),
      repeatEndDate: kind === 'todo' ? '' : String(row?.repeat_end_date || ''),
    };
  }

  function isTodo(event) { return event?.kind === 'todo'; }
  function isCompleted(event) { return isTodo(event) && Boolean(event.completedAt); }
  function isRecurring(event) { return normalizeWeeklyDays(event?.weeklyDays).length > 0; }

  function eventOccursOn(event, date) {
    const key = dateKey(date);
    if (!isRecurring(event)) return event?.date === key;
    const start = event.repeatStartDate || event.date;
    return key >= start && (!event.repeatEndDate || key <= event.repeatEndDate) && normalizeWeeklyDays(event.weeklyDays).includes(date.getDay());
  }

  function eventsForDate(events, date) {
    return (Array.isArray(events) ? events : []).filter((event) => eventOccursOn(event, date)).sort((a, b) => `${a.time}${a.title}`.localeCompare(`${b.time}${b.title}`, 'zh-CN'));
  }

  function monthDays(showing) {
    const first = new Date(showing.getFullYear(), showing.getMonth(), 1, 12);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }

  function moveEvent(event, options = {}) {
    if (rescheduleApi?.moveEvent) return rescheduleApi.moveEvent(event, options);
    return { error: 'reschedule_unavailable' };
  }

  function eventUpdateRow(event) {
    return {
      event_date: event.date,
      start_time: event.time,
      end_time: event.endTime || null,
      repeat_start_date: event.repeatStartDate || event.date,
    };
  }

  function timeLabel(event) {
    return event?.endTime ? `${event.time}–${event.endTime}` : String(event?.time || '');
  }

  return {
    dateKey,
    dateFromKey,
    normalizeTime,
    normalizeWeeklyDays,
    rowToEvent,
    isTodo,
    isCompleted,
    isRecurring,
    eventOccursOn,
    eventsForDate,
    monthDays,
    moveEvent,
    eventUpdateRow,
    timeLabel,
  };
});
