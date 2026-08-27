const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'memo-time-suggestions.js'), 'utf8');
const sandbox = { window: {}, Date, globalThis: {} };
vm.runInNewContext(source, sandbox);
const { detect } = sandbox.window.MemoryEveryDayTimeSuggestions;
const now = new Date(2026, 7, 27, 9, 0, 0);

function one(text, fallbackTitle = 'ACE 345') {
  const result = detect(text, { now, fallbackTitle });
  assert.equal(result.length, 1, text);
  return result[0];
}

assert.deepEqual(
  { ...one('明天下午3点交作业'), key: undefined, source: undefined },
  { title: '交作业', date: '2026-08-28', time: '15:00', endTime: '', mode: 'reminder', key: undefined, source: undefined },
);
assert.equal(one('周五 10:00 小组讨论').date, '2026-08-28');
assert.deepEqual(
  { ...one('8月29日 15:30–16:30 完成实验'), key: undefined, source: undefined },
  { title: '完成实验', date: '2026-08-29', time: '15:30', endTime: '16:30', mode: 'range', key: undefined, source: undefined },
);
assert.equal(one('今晚8点复习').time, '20:00');
assert.equal(one('15:00 写提纲').date, '2026-08-27');
assert.equal(one('08:00 晨读').date, '2026-08-28');
assert.equal(one('tomorrow 3:30pm submit essay').time, '15:30');
assert.equal(one('下周二早上8点做课程展示').date, '2026-09-01');
assert.equal(one('8/29 14:00 写实验报告').date, '2026-08-29');
assert.deepEqual(
  { ...one('August 30 at 4pm submit reading notes'), key: undefined, source: undefined },
  { title: 'submit reading notes', date: '2026-08-30', time: '16:00', endTime: '', mode: 'reminder', key: undefined, source: undefined },
);
assert.equal(one('明天下午3点', '课程作业').title, '课程作业');
assert.equal(detect('2026年8月26日 10:00 已经过期', { now }).length, 0);
assert.equal(detect('课程编号 ACE 345，没有时间', { now }).length, 0);
assert.equal(detect('明天交作业，但还没定时间', { now }).length, 0);
assert.equal(detect('明天下午3点交作业\n后天上午9点小组讨论', { now }).length, 2);

console.log('memo time suggestion tests passed');
