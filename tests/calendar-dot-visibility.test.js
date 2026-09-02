const assert = require('node:assert/strict');
const visibility = require('../calendar-dot-visibility.js');

const date = '2026-09-02';
const beforeEnd = new Date(2026, 8, 2, 11, 19);
const atEnd = new Date(2026, 8, 2, 11, 20);
const rangeEvent = { kind: 'event', date, time: '10:00', endTime: '11:20' };
const reminderEvent = { kind: 'event', date, time: '10:00', endTime: '' };
const openPastTodo = { kind: 'todo', date, time: '08:00', completedAt: '' };
const completedFutureTodo = { kind: 'todo', date, time: '18:00', completedAt: '2026-09-02T12:00:00.000Z' };

assert.equal(visibility.shouldShowEventDot(rangeEvent, date, beforeEnd), true);
assert.equal(visibility.shouldShowEventDot(rangeEvent, date, atEnd), false);
assert.equal(visibility.shouldShowEventDot(reminderEvent, date, new Date(2026, 8, 2, 9, 59)), true);
assert.equal(visibility.shouldShowEventDot(reminderEvent, date, new Date(2026, 8, 2, 10, 0)), false);
assert.equal(visibility.shouldShowEventDot(openPastTodo, date, atEnd), true);
assert.equal(visibility.shouldShowEventDot(completedFutureTodo, date, beforeEnd), false);
assert.deepEqual(visibility.visibleEvents([rangeEvent, openPastTodo, completedFutureTodo], date, beforeEnd), [rangeEvent, openPastTodo]);
console.log('calendar dot visibility tests passed');
