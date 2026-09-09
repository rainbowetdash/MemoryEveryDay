const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('../mobile-widget');
const occurs = (event, date) => event.date === `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` || (event.weeklyDays || []).includes(date.getDay());
const now = new Date(2026, 8, 9, 12);
test('widget snapshot never exports account credentials, notes, or completed todos', () => {
  const events = [{ id:'one', date:'2026-09-09', time:'10:00', endTime:'24:00', title:'日程', note:'private note', secret:'secret' }, { id:'two', date:'2026-09-09', time:'09:00', kind:'todo', completedAt:'done' }];
  const snapshot=build(events,true,occurs,now), items=snapshot.days.find(d=>d.date==='2026-09-09').items;
  assert.equal(items.length,1);
  assert.equal(items[0].endsAt,new Date(2026,8,10).getTime());
  assert.equal(JSON.stringify(snapshot).includes('private note'),false);
  assert.equal(JSON.stringify(snapshot).includes('secret'),false);
});
test('sign out clears all widget data instead of displaying guest or previous account events', () => {
  assert.deepEqual(build([{title:'private'}],false,occurs,now).days,[]);
});
test('snapshot includes recurrence and future month rollover without completing overdue todos', () => {
  const snapshot=build([{id:'repeat',title:'课',time:'09:00',weeklyDays:[3]}, {id:'todo',title:'未完成',kind:'todo',time:'01:00',date:'2026-09-09'}],true,occurs,now);
  assert.equal(snapshot.days.length,98);
  assert.equal(snapshot.days.find(d=>d.date==='2026-09-09').items.length,2);
  assert.equal(snapshot.days.find(d=>d.date==='2026-10-07').items[0].id,'repeat');
});
