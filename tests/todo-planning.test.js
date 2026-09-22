const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../todo-planning');
test('deadlines use local calendar days and never complete overdue todos', () => {
 const item={kind:'todo',dueDate:'2026-09-15',completedAt:''};
 assert.equal(model.due(item,new Date(2026,8,15,23,59)).label,'今天截止');
 assert.equal(model.due(item,new Date(2026,8,16,0,1)).label,'已逾期 1 天');
 assert.equal(item.completedAt,'');
 assert.equal(model.validDate('2026-02-29'),false);
 assert.equal(model.validDate('2028-02-29'),true);
 assert.equal(model.due({...item,completedAt:'done'},new Date(2026,8,16)).tone,'done');
});
test('execution time and due date are independent, tasks without deadlines sort last', () => {
 const pending={id:'a',title:'笔记',kind:'todo',date:'',time:'',dueDate:'2026-09-18'};
 const scheduled={...pending,date:'2026-09-16',time:'14:00'};
 assert.equal(model.pending(pending),true);assert.equal(model.pending(scheduled),false);
 assert.equal(scheduled.dueDate,pending.dueDate);
 assert.deepEqual(model.sort([{...pending,id:'b',dueDate:''},pending]).map(x=>x.id),['a','b']);
});
test('cloud row roundtrip preserves pending state, deadline, completion and identity', () => {
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
 const names=['normalizeTime','normalizeRepeatDate','normalizeWeeklyDays','eventKind','isTodo','isTodoCompleted','rowToEvent','eventToRow'];
 const context=vm.createContext({state:{user:{id:'test-user'}},reminderAtForEvent:()=>null});
 for(const name of names){const line=source.split('\n').find(l=>l.startsWith(`function ${name}(`));assert.ok(line,name);vm.runInContext(line,context);}
 const row={id:'stable-id',item_type:'todo',title:'笔记',event_date:null,start_time:null,due_date:'2026-09-18',is_important:true,completed_at:null};
 context.row=row; const result=vm.runInContext('eventToRow(rowToEvent(row))',context);
 assert.equal(result.is_important,true);assert.equal(result.id,row.id);assert.equal(result.event_date,null);assert.equal(result.start_time,null);assert.equal(result.due_date,row.due_date);assert.equal(result.push_reminder,false);
 row.event_date='2026-09-16';row.start_time='14:00:00';row.completed_at='2026-09-16T20:00:00Z';
 const planned=vm.runInContext('eventToRow(rowToEvent(row))',context);
 assert.equal(planned.is_important,true);assert.equal(planned.start_time,'14:00');assert.equal(planned.due_date,row.due_date);assert.equal(planned.completed_at,row.completed_at);
});
test('four quadrants use importance and calendar deadline, never execution date', () => {
 const now=new Date(2026,8,15,23,59);
 const base={kind:'todo',title:'作业',date:'2030-01-01',time:'09:00',dueDate:'2026-09-17'};
 assert.equal(model.priority({...base,important:true},now),0);
 assert.equal(model.priority({...base,important:true,dueDate:'2026-09-18'},now),1);
 assert.equal(model.priority({...base,important:false},now),2);
 assert.equal(model.priority({...base,important:false,dueDate:''},now),3);
 assert.equal(model.priority({...base,important:true,dueDate:''},now),1);
 assert.equal(model.priority({...base,dueDate:'2026-09-01'},now),2);
 assert.equal(model.priority({...base,dueDate:'invalid'},now),3);
 assert.equal(model.priority({...base,dueDate:'2026-09-18'},new Date(2026,8,16)),2);
});
test('priority and due sort have distinct ordering and do not mutate source items', () => {
 const now=new Date(2026,8,15), items=[
  {id:'a',kind:'todo',title:'普通逾期',important:false,dueDate:'2026-09-14'},
  {id:'b',kind:'todo',title:'重要远期',important:true,dueDate:'2026-09-30'},
  {id:'c',kind:'todo',title:'重要紧急',important:true,dueDate:'2026-09-17'},
  {id:'d',kind:'todo',title:'普通无日期',important:false,dueDate:''}];
 assert.deepEqual(model.sort(items,'priority',now).map(i=>i.id),['c','b','a','d']);
 assert.deepEqual(model.sort(items,'due',now).map(i=>i.id),['a','c','b','d']);
 assert.deepEqual(items.map(i=>i.id),['a','b','c','d']);
});
test('opening an unscheduled todo never assigns a time, including the card action', () => {
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
 const fn=source.slice(source.indexOf('function openPlanningEvent('),source.indexOf("$('planning-entry').onclick"));
 const controls={'planning-dialog':{close(){}},'todo-planning-mode':{value:'pending'}};
 let opened=0;
 const context=vm.createContext({state:{events:[{id:'pending',kind:'todo',date:''},{id:'scheduled',kind:'todo',date:'2026-09-18'}]},$:id=>controls[id],openEventDialog:()=>{},updateTodoPlanningFields:()=>{},openScheduleEditor:()=>opened++});
 vm.runInContext(fn,context);
 vm.runInContext("openPlanningEvent('pending',true)",context);
 assert.equal(controls['todo-planning-mode'].value,'pending');assert.equal(opened,0);
 vm.runInContext("openPlanningEvent('scheduled',true)",context);
 assert.equal(controls['todo-planning-mode'].value,'scheduled');assert.equal(opened,1);
});
test('unplanned deadlines appear only on their day until completed, without changing planning data', () => {
 const item={id:'due',kind:'todo',date:'',time:'',dueDate:'2026-09-22',title:'复习'};
 const before=JSON.stringify(item);
 assert.equal(model.occursOn(item,'2026-09-22'),true);
 assert.equal(model.occursOn(item,'2026-09-21'),false);
 assert.equal(model.occursOn(item,'2026-09-23'),false);
 assert.equal(model.occursOn({...item,completedAt:'done'},'2026-09-22'),false);
 assert.equal(model.occursOn({...item,dueDate:''},'2026-09-22'),false);
 assert.equal(model.occursOn({...item,date:'2026-09-21',time:'10:00'},'2026-09-22'),false);
 assert.equal(model.occursOn({...item,date:'2026-09-21',time:'10:00'},'2026-09-21'),true);
 assert.equal(JSON.stringify(item),before);
});
test('web and desktop calendars include deadline-only tasks before timed entries', () => {
 global.TodoPlanning=model;
 const desktop=require('../desktop-widget-model');
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
 const context=vm.createContext({window:{TodoPlanning:model},dateKey:desktop.dateKey,visibleEvents:()=>items});
 for(const name of ['normalizeRepeatDate','normalizeWeeklyDays','eventKind','isTodo','isWeeklyRepeating','eventOccursOn','eventsFor']) {
  vm.runInContext(source.split('\n').find(l=>l.startsWith(`function ${name}(`)),context);
 }
 const pending=desktop.rowToEvent({id:'pending',title:'笔记',item_type:'todo',event_date:null,start_time:null,due_date:'2026-09-22'});
 assert.equal(pending.time,'');
 const items=[{...pending,id:'timed',date:'2026-09-22',time:'09:00'},pending,{...pending,id:'done',completedAt:'done'}];
 const date=new Date(2026,8,22,12);context.date=date;
 assert.deepEqual(Array.from(vm.runInContext('eventsFor(date)',context),x=>x.id),['pending','timed']);
 assert.deepEqual(desktop.eventsForDate(items,date).map(x=>x.id),['pending','timed']);
});
