(() => {
  const supabaseUrl = 'https://ojhukmhpjovwswnmxoig.supabase.co';
  const supabasePublishableKey = 'sb_publishable_vTBsX9EuhLWb7LBY7PrRlQ_OjX3sw8l';
  const client = window.supabase?.createClient(supabaseUrl, supabasePublishableKey, {
    auth: { storageKey: 'memory-everyday-desktop-widget-auth', persistSession: true, autoRefreshToken: true },
  }) || null;
  const model = window.DesktopWidgetModel;
  const $ = (id) => document.getElementById(id);
  const launchParams = new URLSearchParams(location.search);
  const demoMode = ['127.0.0.1', 'localhost'].includes(location.hostname) && launchParams.get('demo') === '1';
  const desktopShell = launchParams.get('desktop-shell') === '1';
  const desktopVersion = launchParams.get('desktop-version') || '0.1.1';
  const state = {
    user: null,
    events: [],
    selected: new Date(),
    showing: new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12),
    zoomed: localStorage.getItem('memory-everyday-desktop-widget-zoom') === '1',
    syncing: false,
    dragging: null,
    undo: null,
  };
  let syncTimer = null;
  let toastTimer = null;
  let monthHoverTimer = null;
  let pointerTracking = null;
  let lastTimelineDate = '';
  let lastTimelineHadEvents = false;

  const colorHex = {
    blue: '#328ccd', navy: '#3266a7', cyan: '#2db3d6', mint: '#42aaa4', purple: '#8a64c7',
    pink: '#d96696', coral: '#dc795d', yellow: '#c79424', green: '#4d9b63',
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function formatMonth(date) {
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(date);
  }

  function formatSelectedDate(date) {
    return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(date);
  }

  function sameDay(left, right) { return model.dateKey(left) === model.dateKey(right); }

  function compareVersions(left, right) {
    const a = String(left || '0').split('.').map(Number), b = String(right || '0').split('.').map(Number);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const difference = (a[index] || 0) - (b[index] || 0);
      if (difference) return difference;
    }
    return 0;
  }

  function desktopPlatform() {
    if (/windows/i.test(navigator.userAgent)) return 'windows';
    if (/macintosh|mac os x/i.test(navigator.userAgent)) return 'macos';
    return '';
  }

  function cacheKey() { return state.user ? `memory-everyday-desktop-widget-events:${state.user.id}` : ''; }

  function saveSnapshot() {
    if (!state.user) return;
    localStorage.setItem(cacheKey(), JSON.stringify({ events: state.events, savedAt: new Date().toISOString() }));
  }

  function loadSnapshot() {
    if (!state.user) return [];
    try {
      const value = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
      return Array.isArray(value?.events) ? value.events : [];
    } catch { return []; }
  }

  function setSyncStatus(copy, tone = '') {
    $('sync-status').textContent = copy;
    $('sync-status').dataset.tone = tone;
  }

  function setAuthVisible(visible) {
    $('widget-auth').classList.toggle('is-hidden', !visible);
  }

  function eventById(id) { return state.events.find((event) => event.id === id) || null; }

  function eventColor(event) { return colorHex[event?.color] || colorHex.blue; }

  function eventsOn(date) { return model.eventsForDate(state.events, date); }

  function renderCalendar() {
    $('month-label').textContent = formatMonth(state.showing);
    $('selected-date-label').textContent = sameDay(state.selected, new Date()) ? '今天' : formatSelectedDate(state.selected);
    $('desktop-widget').classList.toggle('is-calendar-expanded', state.zoomed);
    $('toggle-widget-zoom').textContent = state.zoomed ? '−' : '＋';
    $('toggle-widget-zoom').setAttribute('aria-label', state.zoomed ? '缩小月历' : '放大月历');
    $('toggle-widget-zoom').setAttribute('aria-pressed', String(state.zoomed));
    $('widget-calendar').innerHTML = model.monthDays(state.showing).map((date) => {
      const dayEvents = eventsOn(date), key = model.dateKey(date), colors = [...new Set(dayEvents.map((event) => event.color || 'blue'))].slice(0, 5);
      const dots = colors.map((color) => `<i style="--dot-color:${eventColor({ color })}"></i>`).join('');
      const previews = dayEvents.slice(0, 2).map((event) => `<span class="widget-day-event ${escapeHtml(event.color || 'blue')} ${model.isRecurring(event) ? 'is-recurring' : ''}" data-widget-event-id="${escapeHtml(event.id)}" title="${escapeHtml(`${model.timeLabel(event)} ${event.title}`)}">${escapeHtml(event.time)} ${escapeHtml(event.title)}</span>`).join('');
      const overflow = dayEvents.length > 2 ? `<span class="widget-day-event" style="--event-color:var(--muted)">另有 ${dayEvents.length - 2} 项</span>` : '';
      return `<button type="button" class="widget-day ${date.getMonth() !== state.showing.getMonth() ? 'is-other' : ''} ${sameDay(date, state.selected) ? 'is-selected' : ''} ${sameDay(date, new Date()) ? 'is-today' : ''}" data-widget-date="${key}" role="gridcell" aria-label="${escapeHtml(`${formatSelectedDate(date)}，${dayEvents.length}项安排`)}"><span class="widget-day-number">${date.getDate()}</span><span class="widget-day-dots">${dots}</span><span class="widget-day-events">${previews}${overflow}</span></button>`;
    }).join('');
    $('widget-calendar').querySelectorAll('[data-widget-date]').forEach((button) => {
      button.addEventListener('click', () => selectDate(button.dataset.widgetDate));
      button.addEventListener('dragover', onDateDragOver);
      button.addEventListener('drop', onDateDrop);
    });
    bindEventDrags($('widget-calendar'));
  }

  function slotRange(dayEvents) {
    const minutes = dayEvents.map((event) => window.CalendarReschedule.timeToMinutes(event.time)).filter(Number.isFinite);
    const first = minutes.length ? Math.min(360, Math.floor(Math.min(...minutes) / 30) * 30) : 360;
    const last = minutes.length ? Math.max(1320, Math.ceil(Math.max(...minutes) / 30) * 30 + 30) : 1320;
    return { first, last: Math.min(1410, last) };
  }

  function timelineEventMarkup(event) {
    const completed = model.isCompleted(event), recurring = model.isRecurring(event), note = event.note || (recurring ? '重复日程请在主应用中修改' : model.isTodo(event) ? '待办完成后可直接勾选' : '拖动卡片可以改变时间');
    return `<article class="timeline-event ${escapeHtml(event.color || 'blue')} ${completed ? 'is-completed' : ''} ${recurring ? 'is-recurring' : ''}" data-widget-event-id="${escapeHtml(event.id)}" aria-label="${escapeHtml(`${model.timeLabel(event)} ${event.title}`)}">${model.isTodo(event) ? `<button type="button" class="todo-check ${completed ? 'is-checked' : ''}" data-widget-todo-id="${escapeHtml(event.id)}" aria-label="${completed ? '恢复为未完成' : '标记为完成'}"></button>` : `<time>${escapeHtml(model.timeLabel(event))}</time>`}<span class="timeline-event-copy"><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(note)}</small></span>${recurring ? '<span class="event-lock" title="重复日程请在主应用中修改">↻</span>' : (model.isTodo(event) ? `<time>${escapeHtml(model.timeLabel(event))}</time>` : '')}</article>`;
  }

  function renderTimeline() {
    const timeline = $('day-timeline'), previousScroll = timeline.scrollTop, selectedKey = model.dateKey(state.selected), dayEvents = eventsOn(state.selected), shouldFocusFirstEvent = lastTimelineDate !== selectedKey || (!lastTimelineHadEvents && dayEvents.length > 0), { first, last } = slotRange(dayEvents), slots = [];
    $('day-year-label').textContent = `${state.selected.getFullYear()}年`;
    $('day-label').textContent = formatSelectedDate(state.selected);
    const todos = dayEvents.filter(model.isTodo), openTodos = todos.filter((event) => !model.isCompleted(event));
    $('day-count').textContent = dayEvents.length ? `${dayEvents.length} 项安排${todos.length ? ` · ${openTodos.length} 项待办` : ''}` : '暂无安排';
    for (let minutes = first; minutes <= last; minutes += 30) {
      const time = window.CalendarReschedule.minutesToTime(minutes), slotEvents = dayEvents.filter((event) => {
        const value = window.CalendarReschedule.timeToMinutes(event.time);
        return value !== null && value >= minutes && value < minutes + 30;
      });
      slots.push(`<section class="timeline-slot ${minutes % 60 ? 'is-half' : ''}" data-widget-time="${time}"><span class="timeline-slot-time">${time}</span><span class="timeline-slot-line"></span>${slotEvents.length ? `<div class="timeline-events">${slotEvents.map(timelineEventMarkup).join('')}</div>` : ''}</section>`);
    }
    timeline.innerHTML = slots.join('');
    $('day-empty').classList.toggle('is-hidden', Boolean(dayEvents.length));
    timeline.querySelectorAll('[data-widget-time]').forEach((slot) => {
      slot.addEventListener('dragover', onTimeDragOver);
      slot.addEventListener('drop', onTimeDrop);
    });
    timeline.querySelectorAll('[data-widget-todo-id]').forEach((button) => button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void toggleTodo(button.dataset.widgetTodoId);
    }));
    bindEventDrags(timeline);
    requestAnimationFrame(() => {
      if (shouldFocusFirstEvent && dayEvents.length) {
        const firstEvent = timeline.querySelector('.timeline-event');
        const firstSlot = firstEvent?.closest('.timeline-slot');
        timeline.scrollTop = Math.max(0, (firstSlot?.offsetTop || 0) - 42);
      } else timeline.scrollTop = previousScroll;
    });
    lastTimelineDate = selectedKey;
    lastTimelineHadEvents = dayEvents.length > 0;
  }

  function render() {
    renderCalendar();
    renderTimeline();
    $('account-summary').textContent = state.user?.email || '尚未登录';
    $('sign-out-widget').classList.toggle('is-hidden', !state.user);
  }

  function selectDate(value) {
    const date = model.dateFromKey(value);
    if (!date) return;
    state.selected = date;
    if (date.getMonth() !== state.showing.getMonth() || date.getFullYear() !== state.showing.getFullYear()) state.showing = new Date(date.getFullYear(), date.getMonth(), 1, 12);
    render();
  }

  async function fetchEvents({ quiet = false } = {}) {
    if (demoMode) return true;
    if (!client || !state.user || state.syncing || state.dragging) return false;
    state.syncing = true;
    if (!quiet) setSyncStatus('正在同步…');
    try {
      const { data, error } = await client.from('schedule_events').select('*').eq('user_id', state.user.id).order('event_date').order('start_time');
      if (error) throw error;
      state.events = (data || []).map(model.rowToEvent).filter((event) => event.id && event.date);
      saveSnapshot();
      render();
      setSyncStatus(`已同步 · ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`, 'ok');
      return true;
    } catch {
      const cached = loadSnapshot();
      if (!state.events.length && cached.length) { state.events = cached; render(); }
      setSyncStatus(cached.length ? '离线显示最近内容' : '暂时无法同步', 'offline');
      return false;
    } finally { state.syncing = false; }
  }

  async function handleSession(user) {
    state.user = user || null;
    setAuthVisible(!state.user);
    if (!state.user) {
      state.events = [];
      clearInterval(syncTimer);
      syncTimer = null;
      setSyncStatus('登录后自动同步');
      render();
      return;
    }
    const cached = loadSnapshot();
    if (cached.length) { state.events = cached; render(); }
    await fetchEvents();
    clearInterval(syncTimer);
    syncTimer = setInterval(() => void fetchEvents({ quiet: true }), 30000);
  }

  async function authenticate(event) {
    event.preventDefault();
    if (!client) { $('widget-auth-error').textContent = '登录服务暂时不可用，请稍后再试'; return; }
    const email = $('widget-auth-email').value.trim(), password = $('widget-auth-password').value, submit = $('widget-auth-submit');
    $('widget-auth-error').textContent = '';
    submit.disabled = true;
    submit.textContent = '正在登录…';
    const { error } = await client.auth.signInWithPassword({ email, password });
    submit.disabled = false;
    submit.textContent = '登录并同步';
    if (error) $('widget-auth-error').textContent = '邮箱或密码不正确';
  }

  function setToast(title, detail, allowUndo = false) {
    clearTimeout(toastTimer);
    $('widget-toast-title').textContent = title;
    $('widget-toast-detail').textContent = detail || '';
    $('undo-widget-move').classList.toggle('is-hidden', !allowUndo);
    $('widget-toast').classList.add('is-visible');
    $('widget-toast').setAttribute('aria-hidden', 'false');
    toastTimer = setTimeout(hideToast, allowUndo ? 9000 : 4200);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    $('widget-toast').classList.remove('is-visible');
    $('widget-toast').setAttribute('aria-hidden', 'true');
  }

  async function openExternalUrl(url) {
    const opener = window.__TAURI__?.opener;
    if (opener?.openUrl) return opener.openUrl(url);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function checkDesktopUpdate() {
    if (!desktopShell) return;
    const platform = desktopPlatform();
    if (!platform) return;
    try {
      const response = await fetch(`./release-info.json?desktop-update=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const info = await response.json(), app = info?.apps?.[platform];
      if (!app?.latestVersion || compareVersions(desktopVersion, app.latestVersion) >= 0) return;
      const dialog = $('widget-update-dialog');
      $('widget-update-title').textContent = `每日备忘桌面版 ${app.latestVersion} 可以更新`;
      $('widget-update-copy').textContent = `当前版本 ${desktopVersion}。安装更新不会影响已同步的日程、待办和登录状态。`;
      $('download-widget-update').onclick = async () => {
        const downloadUrl = new URL(app.downloadUrl, location.href).href;
        try { await openExternalUrl(downloadUrl); } catch { window.open(downloadUrl, '_blank', 'noopener,noreferrer'); }
        dialog.close();
      };
      $('dismiss-widget-update').onclick = () => dialog.close();
      dialog.showModal();
    } catch {}
  }

  async function persistEvent(event) {
    if (demoMode) return;
    const { error } = await client.from('schedule_events').update(model.eventUpdateRow(event)).eq('id', event.id).eq('user_id', state.user.id);
    if (error) throw error;
  }

  async function moveEvent(eventId, options) {
    const current = eventById(eventId);
    if (!current || !state.user) return;
    const moved = model.moveEvent(current, options);
    if (moved.error === 'recurring_event') { setToast('重复日程暂不支持直接拖动', '请打开每日备忘主应用修改重复规则'); return; }
    if (moved.error) { setToast('无法移动这项安排', '请稍后再试'); return; }
    const previous = { ...current }, next = moved.event;
    state.events = state.events.map((event) => event.id === eventId ? next : event);
    if (options.date) {
      state.selected = model.dateFromKey(next.date) || state.selected;
      state.showing = new Date(state.selected.getFullYear(), state.selected.getMonth(), 1, 12);
    }
    render();
    setSyncStatus('正在保存移动…');
    try {
      await persistEvent(next);
      state.undo = { previous, next: { ...next } };
      saveSnapshot();
      setSyncStatus('已同步', 'ok');
      const detail = `${new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(model.dateFromKey(next.date))} · ${model.timeLabel(next)}`;
      setToast('安排已移动', detail, true);
    } catch {
      state.events = state.events.map((event) => event.id === eventId ? previous : event);
      state.undo = null;
      render();
      setSyncStatus('移动没有保存，请重试', 'offline');
      setToast('移动失败', '已经恢复到原来的位置');
    }
  }

  async function undoMove() {
    const snapshot = state.undo;
    if (!snapshot || !state.user) return;
    state.undo = null;
    state.events = state.events.map((event) => event.id === snapshot.previous.id ? snapshot.previous : event);
    state.selected = model.dateFromKey(snapshot.previous.date) || state.selected;
    state.showing = new Date(state.selected.getFullYear(), state.selected.getMonth(), 1, 12);
    render();
    hideToast();
    setSyncStatus('正在撤销…');
    try {
      await persistEvent(snapshot.previous);
      saveSnapshot();
      setSyncStatus('已同步', 'ok');
      setToast('已经撤销移动', `${snapshot.previous.date} · ${model.timeLabel(snapshot.previous)}`);
    } catch {
      state.events = state.events.map((event) => event.id === snapshot.next.id ? snapshot.next : event);
      render();
      setSyncStatus('撤销失败，请稍后重试', 'offline');
      setToast('暂时无法撤销', '已保留刚才的时间');
    }
  }

  async function toggleTodo(eventId) {
    const current = eventById(eventId);
    if (!current || !model.isTodo(current) || !state.user) return;
    const previous = { ...current }, completedAt = model.isCompleted(current) ? '' : new Date().toISOString(), next = { ...current, completedAt };
    state.events = state.events.map((event) => event.id === eventId ? next : event);
    render();
    try {
      if (!demoMode) {
        const { error } = await client.from('schedule_events').update({ completed_at: completedAt || null }).eq('id', eventId).eq('user_id', state.user.id);
        if (error) throw error;
      }
      saveSnapshot();
      setSyncStatus('已同步', 'ok');
    } catch {
      state.events = state.events.map((event) => event.id === eventId ? previous : event);
      render();
      setToast('待办状态没有保存', '请稍后再试');
    }
  }

  function dragGhostMarkup(event) {
    return `<strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(model.timeLabel(event))} · 拖动到日期或时间</small>`;
  }

  function placeGhost(pointer) {
    if (!state.dragging) return;
    const ghost = $('widget-drag-ghost'), width = ghost.offsetWidth || 220, height = ghost.offsetHeight || 52;
    const x = Math.max(10, Math.min(window.innerWidth - width - 10, pointer.clientX - width / 2));
    const above = pointer.clientY - height - 16;
    const y = Math.max(10, Math.min(window.innerHeight - height - 10, above > 8 ? above : pointer.clientY + 16));
    ghost.style.transform = `translate3d(${x}px,${y}px,0)`;
  }

  function setDragStatus(copy = '') {
    $('widget-drag-status').textContent = copy;
    $('widget-drag-status').classList.toggle('is-visible', Boolean(copy));
  }

  function clearDropTargets() {
    document.querySelectorAll('.is-drop-target').forEach((element) => element.classList.remove('is-drop-target'));
  }

  function showDrag(eventId, pointer) {
    const schedule = eventById(eventId);
    if (!schedule || model.isRecurring(schedule)) return false;
    state.dragging = { eventId };
    document.body.classList.remove('is-widget-drag-primed');
    document.body.classList.add('is-widget-dragging');
    window.getSelection?.()?.removeAllRanges?.();
    $('widget-drag-ghost').className = `drag-ghost is-visible ${schedule.color || 'blue'}`;
    $('widget-drag-ghost').innerHTML = dragGhostMarkup(schedule);
    setDragStatus('拖到左侧日期改期，拖到右侧时间改时');
    requestAnimationFrame(() => placeGhost(pointer));
    return true;
  }

  function endDrag() {
    state.dragging = null;
    document.body.classList.remove('is-widget-drag-primed', 'is-widget-dragging');
    clearTimeout(monthHoverTimer);
    monthHoverTimer = null;
    clearDropTargets();
    $('widget-drag-ghost').className = 'drag-ghost';
    $('widget-drag-ghost').innerHTML = '';
    setDragStatus('');
  }

  function clearPointerTracking() {
    if (pointerTracking?.timer) clearTimeout(pointerTracking.timer);
    pointerTracking = null;
    if (!state.dragging) document.body.classList.remove('is-widget-drag-primed', 'is-widget-dragging');
  }

  function showLockedDragFeedback(eventId) {
    const schedule = eventById(eventId);
    if (!schedule) return;
    document.querySelectorAll(`[data-widget-event-id="${CSS.escape(eventId)}"]`).forEach((element) => {
      element.classList.remove('is-locked-feedback');
      requestAnimationFrame(() => element.classList.add('is-locked-feedback'));
      setTimeout(() => element.classList.remove('is-locked-feedback'), 420);
    });
    setToast('这门课程不能直接拖动', '重复课程会影响整套安排，请在每日备忘 App 中修改重复规则');
  }

  function bindEventDrags(container) {
    container.querySelectorAll('[data-widget-event-id]').forEach((element) => {
      const schedule = eventById(element.dataset.widgetEventId);
      if (!schedule) return;
      element.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.target.closest('[data-widget-todo-id]')) return;
        event.preventDefault();
        window.getSelection?.()?.removeAllRanges?.();
        document.body.classList.add('is-widget-drag-primed');
        pointerTracking = { eventId: element.dataset.widgetEventId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false, locked: model.isRecurring(schedule), timer: null };
        element.setPointerCapture?.(event.pointerId);
        if (event.pointerType !== 'mouse') pointerTracking.timer = setTimeout(() => {
          if (!pointerTracking || pointerTracking.pointerId !== event.pointerId) return;
          if (pointerTracking.locked) {
            showLockedDragFeedback(pointerTracking.eventId);
            clearPointerTracking();
          } else pointerTracking.active = showDrag(pointerTracking.eventId, event);
        }, 500);
      });
    });
  }

  function pointerDropTarget(pointer) {
    const target = document.elementFromPoint(pointer.clientX, pointer.clientY);
    return target?.closest?.('[data-widget-date], [data-widget-time], #previous-widget-month, #next-widget-month') || null;
  }

  function updatePointerTarget(pointer) {
    if (!state.dragging) return;
    placeGhost(pointer);
    const target = pointerDropTarget(pointer);
    clearDropTargets();
    if (target?.dataset.widgetDate) {
      clearTimeout(monthHoverTimer);
      monthHoverTimer = null;
      target.classList.add('is-drop-target');
      setDragStatus(`放到 ${formatSelectedDate(model.dateFromKey(target.dataset.widgetDate))}，时间保持不变`);
      return;
    }
    if (target?.dataset.widgetTime) {
      clearTimeout(monthHoverTimer);
      monthHoverTimer = null;
      target.classList.add('is-drop-target');
      setDragStatus(`放到 ${target.dataset.widgetTime}，原时长保持不变`);
      return;
    }
    const direction = target?.id === 'previous-widget-month' ? -1 : target?.id === 'next-widget-month' ? 1 : 0;
    if (direction && !monthHoverTimer) monthHoverTimer = setTimeout(() => {
      changeShowingMonth(direction);
      monthHoverTimer = null;
    }, 620);
    if (!direction) { clearTimeout(monthHoverTimer); monthHoverTimer = null; setDragStatus('拖到左侧日期改期，拖到右侧时间改时'); }
  }

  function onPointerMove(event) {
    if (!pointerTracking || event.pointerId !== pointerTracking.pointerId) return;
    const distance = Math.hypot(event.clientX - pointerTracking.startX, event.clientY - pointerTracking.startY);
    if (!pointerTracking.active) {
      if (pointerTracking.locked && distance >= 5) {
        event.preventDefault();
        showLockedDragFeedback(pointerTracking.eventId);
        clearPointerTracking();
        return;
      }
      if (event.pointerType === 'mouse' && distance >= 5) pointerTracking.active = showDrag(pointerTracking.eventId, event);
      else if (event.pointerType !== 'mouse' && distance > 11) {
        clearPointerTracking();
        return;
      }
    }
    if (pointerTracking?.active) { event.preventDefault(); window.getSelection?.()?.removeAllRanges?.(); updatePointerTarget(event); }
  }

  function finishPointerDrag(event) {
    if (!pointerTracking || event.pointerId !== pointerTracking.pointerId) return;
    const active = pointerTracking.active, eventId = pointerTracking.eventId, target = active ? pointerDropTarget(event) : null;
    clearPointerTracking();
    if (!active) return;
    const options = target?.dataset.widgetDate ? { date: target.dataset.widgetDate } : target?.dataset.widgetTime ? { date: model.dateKey(state.selected), time: target.dataset.widgetTime } : null;
    endDrag();
    if (options) void moveEvent(eventId, options);
  }

  function onDateDragOver(event) {
    if (!state.dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    clearDropTargets();
    event.currentTarget.classList.add('is-drop-target');
    const date = model.dateFromKey(event.currentTarget.dataset.widgetDate);
    setDragStatus(`放到 ${formatSelectedDate(date)}，时间保持不变`);
  }

  function onDateDrop(event) {
    if (!state.dragging) return;
    event.preventDefault();
    const { eventId } = state.dragging, date = event.currentTarget.dataset.widgetDate;
    endDrag();
    void moveEvent(eventId, { date });
  }

  function onTimeDragOver(event) {
    if (!state.dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    clearDropTargets();
    event.currentTarget.classList.add('is-drop-target');
    setDragStatus(`放到 ${event.currentTarget.dataset.widgetTime}，原时长保持不变`);
  }

  function onTimeDrop(event) {
    if (!state.dragging) return;
    event.preventDefault();
    const { eventId } = state.dragging, time = event.currentTarget.dataset.widgetTime, date = model.dateKey(state.selected);
    endDrag();
    void moveEvent(eventId, { date, time });
  }

  function changeShowingMonth(direction) {
    state.showing = new Date(state.showing.getFullYear(), state.showing.getMonth() + direction, 1, 12);
    renderCalendar();
  }

  function bindMonthHover(button, direction) {
    button.addEventListener('dragenter', () => {
      if (!state.dragging) return;
      clearTimeout(monthHoverTimer);
      monthHoverTimer = setTimeout(() => changeShowingMonth(direction), 620);
    });
    button.addEventListener('dragleave', () => { clearTimeout(monthHoverTimer); monthHoverTimer = null; });
    button.addEventListener('drop', () => { clearTimeout(monthHoverTimer); monthHoverTimer = null; });
  }

  async function nativeWindow() {
    try { return window.__TAURI__?.window?.getCurrentWindow?.() || null; } catch { return null; }
  }

  async function setupNativeWindowActions() {
    const appWindow = await nativeWindow();
    document.body.classList.toggle('is-tauri', Boolean(appWindow));
    if (!appWindow) return;
    try {
      const pinned = await appWindow.isAlwaysOnTop();
      $('pin-widget').setAttribute('aria-pressed', String(pinned));
      $('pin-widget').textContent = pinned ? '◆' : '◇';
    } catch {}
    $('pin-widget').onclick = async () => {
      const pinned = $('pin-widget').getAttribute('aria-pressed') === 'true';
      await appWindow.setAlwaysOnTop(!pinned);
      $('pin-widget').setAttribute('aria-pressed', String(!pinned));
      $('pin-widget').textContent = !pinned ? '◆' : '◇';
    };
    $('minimize-widget').onclick = () => appWindow.minimize();
    $('close-widget').onclick = () => appWindow.close();
  }

  function nativeAutostart() {
    const direct = window.__TAURI__?.autostart;
    if (direct?.enable && direct?.disable && direct?.isEnabled) return direct;
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) return null;
    return {
      enable: () => invoke('plugin:autostart|enable'),
      disable: () => invoke('plugin:autostart|disable'),
      isEnabled: () => invoke('plugin:autostart|is_enabled'),
    };
  }

  async function setupAutostartControl() {
    const button = $('autostart-widget'), autostart = nativeAutostart();
    if (!button || !autostart) return;
    const update = (enabled) => {
      button.setAttribute('aria-checked', String(Boolean(enabled)));
      button.title = enabled ? '关闭开机自动启动' : '开启开机自动启动';
      button.setAttribute('aria-label', button.title);
    };
    try {
      update(await autostart.isEnabled());
      button.disabled = false;
    } catch {
      button.disabled = true;
      button.title = '当前系统暂时无法设置开机启动';
      return;
    }
    button.onclick = async () => {
      if (button.disabled) return;
      const next = button.getAttribute('aria-checked') !== 'true';
      button.disabled = true;
      try {
        if (next) await autostart.enable(); else await autostart.disable();
        update(await autostart.isEnabled());
        setToast(next ? '已开启开机启动' : '已关闭开机启动', next ? '下次开机后会自动打开每日备忘' : '以后可以随时重新开启');
      } catch {
        setToast('开机启动没有修改', '请稍后再试');
      } finally { button.disabled = false; }
    };
  }

  $('widget-auth-form').addEventListener('submit', authenticate);
  $('previous-widget-month').onclick = () => changeShowingMonth(-1);
  $('next-widget-month').onclick = () => changeShowingMonth(1);
  $('widget-today').onclick = () => { const today = new Date(); state.selected = today; state.showing = new Date(today.getFullYear(), today.getMonth(), 1, 12); render(); };
  $('toggle-widget-zoom').onclick = () => { state.zoomed = !state.zoomed; localStorage.setItem('memory-everyday-desktop-widget-zoom', state.zoomed ? '1' : '0'); renderCalendar(); };
  $('refresh-widget').onclick = () => void fetchEvents();
  $('sign-out-widget').onclick = () => client?.auth.signOut();
  $('undo-widget-move').onclick = () => void undoMove();
  $('close-widget-toast').onclick = hideToast;
  document.addEventListener('pointermove', onPointerMove, { passive: false });
  document.addEventListener('pointerup', finishPointerDrag);
  document.addEventListener('pointercancel', finishPointerDrag);
  document.addEventListener('selectstart', (event) => { if (pointerTracking || state.dragging) event.preventDefault(); });
  document.addEventListener('dragstart', (event) => { if (event.target.closest?.('[data-widget-event-id]')) event.preventDefault(); });
  window.addEventListener('focus', () => void fetchEvents({ quiet: true }));
  window.addEventListener('online', () => void fetchEvents());
  bindMonthHover($('previous-widget-month'), -1);
  bindMonthHover($('next-widget-month'), 1);

  function startDemoMode() {
    const today = new Date(), key = model.dateKey(today), tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    state.user = { id: 'desktop-widget-demo', email: '桌面体验账号' };
    state.selected = today;
    state.showing = new Date(today.getFullYear(), today.getMonth(), 1, 12);
    state.events = [
      { id: 'demo-1', title: 'ACE 445 · Review 上课笔记', note: '整理今天的重点', kind: 'event', completedAt: '', date: key, time: '09:00', endTime: '10:20', color: 'cyan', groupId: 'course', weeklyDays: [], repeatStartDate: key, repeatEndDate: '' },
      { id: 'demo-2', title: '完成 Weekly Assignment', note: '提交前检查引用格式', kind: 'todo', completedAt: '', date: key, time: '11:00', endTime: '', color: 'navy', groupId: 'course', weeklyDays: [], repeatStartDate: key, repeatEndDate: '' },
      { id: 'demo-3', title: '团队项目会议', note: '重复日程请在主应用中修改', kind: 'event', completedAt: '', date: key, time: '15:00', endTime: '15:50', color: 'purple', groupId: 'course', weeklyDays: [today.getDay()], repeatStartDate: key, repeatEndDate: '' },
      { id: 'demo-4', title: '阅读 19 页书', note: '晚饭后完成', kind: 'todo', completedAt: '', date: model.dateKey(tomorrow), time: '20:00', endTime: '', color: 'mint', groupId: 'life', weeklyDays: [], repeatStartDate: model.dateKey(tomorrow), repeatEndDate: '' },
    ];
    setAuthVisible(false);
    setSyncStatus('演示数据 · 拖动即可体验', 'ok');
    render();
  }

  render();
  void setupNativeWindowActions();
  void setupAutostartControl();
  void checkDesktopUpdate();
  if (demoMode) startDemoMode();
  else if (client) {
    client.auth.onAuthStateChange((_event, session) => void handleSession(session?.user || null));
    client.auth.getSession().then(({ data }) => handleSession(data.session?.user || null)).catch(() => handleSession(null));
  } else {
    setAuthVisible(true);
    $('widget-auth-error').textContent = '登录服务暂时不可用，请检查网络';
  }
})();
