(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CalendarReschedule = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function timeToMinutes(value, allowEndOfDay = false) {
    const match = String(value || '').trim().match(/^(\d{1,2}):([0-5]\d)$/);
    if (!match) return null;
    const hours = Number(match[1]), minutes = Number(match[2]);
    if (hours > 23 && !(allowEndOfDay && hours === 24 && minutes === 0)) return null;
    return hours * 60 + minutes;
  }

  function minutesToTime(value, allowEndOfDay = false) {
    const minutes = Math.round(Number(value));
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440 || (minutes === 1440 && !allowEndOfDay)) return '';
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function eventDuration(event) {
    const start = timeToMinutes(event?.time), end = timeToMinutes(event?.endTime, true);
    return start !== null && end !== null && end > start ? end - start : 0;
  }

  function isRecurring(event) {
    return Array.isArray(event?.weeklyDays) && event.weeklyDays.length > 0;
  }

  function moveEvent(event, options = {}) {
    if (!event || !event.id) return { error: 'invalid_event' };
    if (isRecurring(event)) return { error: 'recurring_event' };
    const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(options.date || '')) ? String(options.date) : event.date;
    const changingTime = options.time !== undefined;
    const targetMinutes = changingTime ? timeToMinutes(options.time) : timeToMinutes(event.time);
    if (targetMinutes === null) return { error: 'invalid_time' };
    const duration = eventDuration(event);
    const latestStart = duration ? Math.max(0, Math.floor((1440 - duration) / 30) * 30) : 1410;
    const start = changingTime ? Math.min(targetMinutes, latestStart) : targetMinutes;
    const next = {
      ...event,
      date: targetDate,
      time: minutesToTime(start),
      repeatStartDate: targetDate,
    };
    if (duration) next.endTime = minutesToTime(start + duration, true);
    return {
      event: next,
      duration,
      adjusted: start !== targetMinutes,
      requestedTime: minutesToTime(targetMinutes),
    };
  }

  function timeLabel(event) {
    return event?.endTime ? `${event.time}–${event.endTime}` : String(event?.time || '');
  }

  return { timeToMinutes, minutesToTime, eventDuration, isRecurring, moveEvent, timeLabel };
});
