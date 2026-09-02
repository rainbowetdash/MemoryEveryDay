const assert = require('node:assert/strict');
global.CalendarReschedule = require('../calendar-reschedule.js');
delete require.cache[require.resolve('../desktop-widget-model.js')];
const model = require('../desktop-widget-model.js');

const row = {
  id: 'course-1', title: 'ACE 445', note: '复习', item_type: 'event', event_date: '2026-09-01',
  start_time: '10:00:00', end_time: '11:20:00', color: 'cyan', group_id: 'course',
  repeat_weekdays: [], repeat_start_date: '2026-09-01', repeat_end_date: null,
};
const event = model.rowToEvent(row);
assert.equal(event.time, '10:00');
assert.equal(event.endTime, '11:20');
assert.equal(model.timeLabel(event), '10:00–11:20');

const moved = model.moveEvent(event, { date: '2026-09-03', time: '10:30' });
assert.equal(moved.event.date, '2026-09-03');
assert.equal(moved.event.time, '10:30');
assert.equal(moved.event.endTime, '11:50');
assert.deepEqual(model.eventUpdateRow(moved.event), {
  event_date: '2026-09-03', start_time: '10:30', end_time: '11:50', repeat_start_date: '2026-09-03',
});

const repeating = { ...event, weeklyDays: [2, 4], repeatStartDate: '2026-09-01', repeatEndDate: '2026-09-30' };
assert.equal(model.eventOccursOn(repeating, new Date(2026, 8, 3, 12)), true);
assert.equal(model.eventOccursOn(repeating, new Date(2026, 8, 4, 12)), false);
assert.equal(model.moveEvent(repeating, { date: '2026-09-08' }).error, 'recurring_event');

assert.equal(model.monthDays(new Date(2026, 8, 1, 12)).length, 42);
assert.deepEqual(model.calendarDotColors([
  { color: 'cyan' },
  { color: 'blue' },
  { color: 'blue' },
  { color: 'mint' },
]), ['cyan', 'blue', 'blue', 'mint']);
console.log('desktop widget model tests passed');
