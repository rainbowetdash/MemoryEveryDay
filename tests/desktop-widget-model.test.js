const assert = require('node:assert/strict');
global.CalendarReschedule = require('../calendar-reschedule.js');
global.CalendarDotVisibility = require('../calendar-dot-visibility.js');
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
], new Date(2026, 8, 2, 12), new Date(2026, 8, 2, 8)), ['cyan', 'blue', 'blue', 'mint']);
console.log('desktop widget model tests passed');

// Preset resizing stays inside a monitor's usable area, including negative origins.
const { windowSizePresets, windowPresetBounds } = require('../desktop-widget-model.js');
assert.deepEqual(windowSizePresets.small, { width: 310, height: 215, label: '小' });
assert.deepEqual(windowPresetBounds('large', { x: 0, y: 23, width: 1440, height: 877 }, { x: 1250, y: 750 }), { width: 840, height: 560, x: 600, y: 340 });
assert.deepEqual(windowPresetBounds('medium', { x: -1920, y: 0, width: 1920, height: 1080 }, { x: -100, y: 900 }), { width: 620, height: 430, x: -620, y: 650 });
assert.deepEqual(windowPresetBounds('large', { x: 0, y: 0, width: 800, height: 500 }, { x: 0, y: 0 }), { width: 800, height: 500, x: 0, y: 0 });
assert.equal(windowPresetBounds('unknown', {}, {}), null);
