const storageKey = 'memory-everyday-events';
const state = { selected: new Date(), showing: new Date(), events: JSON.parse(localStorage.getItem(storageKey) || '[]') };
const $ = (id) => document.getElementById(id);
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const formatDate = (date) => new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(date);
const save = () => localStorage.setItem(storageKey, JSON.stringify(state.events));
function eventsFor(date){return state.events.filter(e=>e.date===dateKey(date)).sort((a,b)=>a.time.localeCompare(b.time));}
function renderCalendar(){
  const year=state.showing.getFullYear(), month=state.showing.getMonth();
  $('month-label').textContent=`${year}年${month+1}月`;
  const first=new Date(year,month,1), start=new Date(year,month,1-first.getDay()), grid=$('calendar-grid'); grid.innerHTML='';
  for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const b=document.createElement('button');const sameMonth=d.getMonth()===month; b.className=`day-cell ${sameMonth?'':'is-other'} ${dateKey(d)===dateKey(state.selected)?'is-selected':''} ${dateKey(d)===dateKey(new Date())?'is-today':''}`;b.textContent=d.getDate();if(eventsFor(d).length){const dot=document.createElement('i');dot.className='event-dot';b.append(dot)}b.onclick=()=>{state.selected=d;state.showing=new Date(d);render()};grid.append(b)}
}
function eventMarkup(e,card=false){return `<div class="${card?'event-card':'agenda-item'} ${e.color}"><span class="${card?'':'agenda-time'}">${e.time}</span><div><strong class="${card?'':'agenda-title'}">${e.title}</strong>${card?`<small>${e.time}</small>`:''}</div></div>`}
function renderAgenda(){const events=eventsFor(state.selected);$('selected-date-label').textContent=formatDate(state.selected);$('schedule-count').textContent=events.length?`${events.length} 项日程`:'';$('calendar-agenda').innerHTML=events.length?events.map(e=>eventMarkup(e)).join(''):'<div class="empty-state">这一天还没有安排，点右下角加一个吧</div>'}
function renderDay(){const d=state.selected;$('day-weekday').textContent=new Intl.DateTimeFormat('zh-CN',{weekday:'long'}).format(d);$('day-title').textContent=new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric'}).format(d);const events=eventsFor(d);$('day-summary').textContent=events.length?`今天有 ${events.length} 项安排`:'今天留给自己慢慢安排';let html='';for(let h=6;h<=22;h++){const time=String(h).padStart(2,'0')+':00';html+=`<div class="time-row"><span class="time-label">${time}</span><div class="time-line"></div>${events.filter(e=>e.time.slice(0,2)===String(h).padStart(2,'0')).map(e=>eventMarkup(e,true)).join('')}</div>`}$('timeline').innerHTML=html}
function render(){renderCalendar();renderAgenda();renderDay()}
document.querySelectorAll('.tab').forEach(tab=>tab.onclick=()=>{document.querySelectorAll('.tab').forEach(t=>t.classList.remove('is-active'));tab.classList.add('is-active');document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('is-hidden',s.id!==tab.dataset.screen))});
$('previous-month').onclick=()=>{state.showing.setMonth(state.showing.getMonth()-1);renderCalendar()};$('next-month').onclick=()=>{state.showing.setMonth(state.showing.getMonth()+1);renderCalendar()};$('today-button').onclick=$('jump-today').onclick=()=>{state.selected=new Date();state.showing=new Date();render()};
$('add-button').onclick=()=>{$('event-date').value=dateKey(state.selected);$('event-title').value='';$('event-dialog').showModal();$('event-title').focus()};
$('event-form').addEventListener('submit',e=>{e.preventDefault();const title=$('event-title').value.trim();if(!title)return;state.events.push({id:crypto.randomUUID(),title,date:$('event-date').value,time:$('event-time').value,color:$('event-color').value});save();state.selected=new Date($('event-date').value+'T12:00:00');state.showing=new Date(state.selected);$('event-dialog').close();render()});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js');render();
