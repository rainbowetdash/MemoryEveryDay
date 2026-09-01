const assert = require('node:assert/strict');
const { moveEvent, eventDuration } = require('../calendar-reschedule.js');

const base = {
  id: 'event-1',
  title: '课程',
  date: '2026-09-01',
  time: '10:00',
  endTime: '11:20',
  mode: 'range',
  weeklyDays: [],
  repeatStartDate: '2026-09-01',
};

assert.equal(eventDuration(base), 80);
assert.deepEqual(
  (({ date, time, endTime, repeatStartDate }) => ({ date, time, endTime, repeatStartDate }))(
    moveEvent(base, { date: '2026-09-02', time: '10:30' }).event,
  ),
  { date: '2026-09-02', time: '10:30', endTime: '11:50', repeatStartDate: '2026-09-02' },
);
assert.equal(moveEvent(base, { time: '11:00' }).event.endTime, '12:20');
assert.equal(moveEvent(base, { time: '23:30' }).event.time, '22:30');
assert.equal(moveEvent(base, { time: '23:30' }).event.endTime, '23:50');
assert.equal(moveEvent(base, { time: '23:30' }).adjusted, true);

const reminder = { ...base, id: 'todo-1', time: '20:07', endTime: '', mode: 'reminder' };
assert.equal(moveEvent(reminder, { date: '2026-09-03', time: '20:30' }).event.time, '20:30');
assert.equal(moveEvent(reminder, { date: '2026-09-03', time: '20:30' }).event.endTime, '');
assert.equal(moveEvent({ ...reminder, time: '23:50' }, { date: '2026-09-03' }).event.time, '23:50');

assert.equal(moveEvent({ ...base, weeklyDays: [1, 3] }, { date: '2026-09-08' }).error, 'recurring_event');

console.log('calendar reschedule tests passed');
