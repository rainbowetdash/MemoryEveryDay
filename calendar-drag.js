(() => {
  const HOLD_DELAY = 500;
  const MOVE_CANCEL_DISTANCE = 10;
  const NAVIGATION_DELAY = 720;
  const EVENT_SELECTOR = '.calendar-event[data-event-id], .calendar-focus-event[data-event-id], .agenda-item[data-event-id], .event-card[data-event-id]';
  let tracking = null;
  let drag = null;
  let suppressClickUntil = 0;
  let navigationTimer = null;
  let navigationDirection = 0;
  let toastTimer = null;
  let undoSnapshot = null;
  let scrollFrame = null;
  let scrollVelocity = 0;
  let lastPoint = null;

  function dateLabel(value) {
    try { return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T12:00:00`)); }
    catch { return value; }
  }

  function durationLabel(minutes) {
    if (!minutes) return '';
    const hours = Math.floor(minutes / 60), rest = minutes % 60;
    return `${hours ? `${hours}小时` : ''}${rest ? `${rest}分钟` : ''}`;
  }

  function setDragStatus(copy = '', tone = '') {
    const status = $('calendar-drag-status');
    status.textContent = copy;
    status.dataset.tone = tone;
    status.classList.toggle('is-visible', Boolean(copy));
  }

  function showMoveToast(title, copy = '', allowUndo = false) {
    clearTimeout(toastTimer);
    const toast = $('calendar-move-toast');
    $('calendar-move-toast-title').textContent = title;
    $('calendar-move-toast-copy').textContent = copy;
    $('undo-calendar-move').classList.toggle('is-hidden', !allowUndo);
    toast.inert = false;
    toast.setAttribute('aria-hidden', 'false');
    toast.classList.add('is-visible');
    toastTimer = setTimeout(hideMoveToast, allowUndo ? 9000 : 4200);
  }

  function hideMoveToast() {
    clearTimeout(toastTimer);
    const toast = $('calendar-move-toast');
    toast.classList.remove('is-visible');
    toast.setAttribute('aria-hidden', 'true');
    toast.inert = true;
  }

  function dragGhost(event) {
    const ghost = document.createElement('div');
    ghost.className = `calendar-drag-ghost ${event.color || 'blue'} ${isTodo(event) ? 'is-todo' : ''}`;
    ghost.innerHTML = `<span>${isTodo(event) ? '□' : '◷'}</span><div><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(CalendarReschedule.timeLabel(event))}</small></div>`;
    document.body.append(ghost);
    return ghost;
  }

  function placeGhost(point) {
    if (!drag?.ghost) return;
    const width = drag.ghost.offsetWidth || 210, height = drag.ghost.offsetHeight || 58;
    const x = Math.min(window.innerWidth - width - 10, Math.max(10, point.x - width / 2));
    const preferredY = point.y - height - 18;
    const y = Math.min(window.innerHeight - height - 10, Math.max(10, preferredY >= 10 ? preferredY : point.y + 18));
    drag.ghost.style.transform = `translate3d(${x}px,${y}px,0)`;
  }

  function clearDropTargets() {
    document.querySelectorAll('.is-calendar-drop-target, .is-time-drop-target').forEach((element) => element.classList.remove('is-calendar-drop-target', 'is-time-drop-target'));
  }

  function clearNavigationTarget() {
    clearTimeout(navigationTimer);
    navigationTimer = null;
    navigationDirection = 0;
    $('previous-month')?.classList.remove('is-month-drag-target');
    $('next-month')?.classList.remove('is-month-drag-target');
  }

  function moveShowingMonth(direction) {
    const showing = state.showing;
    state.showing = new Date(showing.getFullYear(), showing.getMonth() + direction, 1, 12);
    renderCalendar(true);
    clearNavigationTarget();
    requestAnimationFrame(() => { if (drag && lastPoint) updateDragTarget(lastPoint); });
  }

  function setNavigationTarget(direction) {
    if (navigationDirection === direction) return;
    clearNavigationTarget();
    navigationDirection = direction;
    const button = direction < 0 ? $('previous-month') : $('next-month');
    button?.classList.add('is-month-drag-target');
    setDragStatus(`停留片刻，切换到${direction < 0 ? '上' : '下'}个月`);
    navigationTimer = setTimeout(() => moveShowingMonth(direction), NAVIGATION_DELAY);
  }

  function updateTimelineScroll(point) {
    if (drag?.mode !== 'time') { scrollVelocity = 0; return; }
    const timeline = $('timeline'), rect = timeline.getBoundingClientRect(), edge = 58;
    if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) { scrollVelocity = 0; return; }
    if (point.y < rect.top + edge) scrollVelocity = -Math.min(4.5, (rect.top + edge - point.y) / edge * 4.5);
    else if (point.y > rect.bottom - edge) scrollVelocity = Math.min(4.5, (point.y - (rect.bottom - edge)) / edge * 4.5);
    else scrollVelocity = 0;
  }

  function runTimelineScroll() {
    if (!drag) { scrollFrame = null; return; }
    if (scrollVelocity) {
      const timeline = $('timeline'), before = timeline.scrollTop;
      timeline.scrollTop += scrollVelocity;
      if (timeline.scrollTop !== before && lastPoint) updateDragTarget(lastPoint, true);
    }
    scrollFrame = requestAnimationFrame(runTimelineScroll);
  }

  function updateDragTarget(point) {
    if (!drag) return;
    lastPoint = point;
    placeGhost(point);
    clearDropTargets();
    const hit = document.elementFromPoint(point.x, point.y);
    if (drag.mode === 'date') {
      const previous = hit?.closest?.('#previous-month'), next = hit?.closest?.('#next-month');
      if (previous || next) { setNavigationTarget(previous ? -1 : 1); drag.targetDate = ''; return; }
      clearNavigationTarget();
      const target = hit?.closest?.('.day-cell[data-date], .calendar-focus-day[data-date]');
      drag.targetDate = target?.dataset.date || '';
      if (target) {
        target.classList.add('is-calendar-drop-target');
        setDragStatus(`松手移到 ${dateLabel(drag.targetDate)}`, 'ready');
      } else setDragStatus('拖到月历中的目标日期；停在月份箭头可继续翻月');
      return;
    }
    clearNavigationTarget();
    const target = hit?.closest?.('.time-row[data-time-slot]');
    drag.targetTime = target?.dataset.timeSlot || '';
    if (target) {
      const preview = CalendarReschedule.moveEvent(drag.event, { date: drag.event.date, time: drag.targetTime });
      target.classList.add('is-time-drop-target');
      setDragStatus(`松手调整到 ${CalendarReschedule.timeLabel(preview.event)}`, 'ready');
    } else setDragStatus('上下拖到目标时间，每半小时吸附一次');
    updateTimelineScroll(point);
  }

  function stopTracking() {
    clearTimeout(tracking?.timer);
    tracking = null;
    window.removeEventListener('pointermove', trackPointerMove, true);
    window.removeEventListener('pointerup', finishPointer, true);
    window.removeEventListener('pointercancel', cancelPointer, true);
  }

  function cleanupDrag() {
    clearNavigationTarget();
    clearDropTargets();
    setDragStatus('');
    scrollVelocity = 0;
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
    drag?.source?.classList.remove('is-calendar-drag-source');
    drag?.ghost?.remove();
    document.body.classList.remove('is-dragging-calendar-event');
    drag = null;
    lastPoint = null;
  }

  function persistMovedEvent(before, after) {
    state.events = state.events.map((item) => item.id === after.id ? after : item);
    cancelNativeNotification(after.id);
    scheduleNativeNotification(after);
    save();
    if (state.user) {
      queueOperation({ type: 'upsert', id: after.id, event: after });
      void flushPendingOps();
    }
  }

  function applyMove(original, options, mode) {
    const result = CalendarReschedule.moveEvent(original, options);
    if (result.error) return;
    const moved = result.event;
    if (moved.date === original.date && moved.time === original.time && moved.endTime === original.endTime) {
      showMoveToast('位置没有改变', '长按后拖到新的日期或时间即可调整');
      return;
    }
    persistMovedEvent(original, moved);
    undoSnapshot = { before: { ...original }, after: { ...moved } };
    if (mode === 'date') {
      state.selected = new Date(`${moved.date}T12:00:00`);
      state.showing = new Date(state.selected);
    }
    render();
    if (mode === 'time') requestAnimationFrame(() => document.querySelector(`.time-row[data-time-slot="${moved.time}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    const rangeCopy = CalendarReschedule.timeLabel(moved);
    if (mode === 'date') showMoveToast(`已移到 ${dateLabel(moved.date)}`, `时间保持 ${rangeCopy}`, true);
    else {
      const duration = durationLabel(result.duration);
      showMoveToast(`已调整为 ${rangeCopy}`, result.adjusted ? `已吸附到当天最晚可用时间，${duration ? `时长仍为 ${duration}` : '提醒时长不变'}` : (duration ? `时长保持 ${duration}` : '日期保持不变'), true);
    }
  }

  function activateDrag() {
    if (!tracking) return;
    const event = state.events.find((item) => item.id === tracking.eventId);
    if (!event) { stopTracking(); return; }
    if (CalendarReschedule.isRecurring(event)) {
      tracking.blocked = true;
      clearTimeout(tracking.timer);
      showMoveToast('重复日程暂不能直接拖动', '为避免整组课程被误改，请点开日程调整重复规则');
      return;
    }
    drag = {
      event: { ...event },
      source: tracking.source,
      pointerId: tracking.pointerId,
      mode: tracking.source.closest('#timeline') ? 'time' : 'date',
      targetDate: '',
      targetTime: '',
    };
    drag.source.classList.add('is-calendar-drag-source');
    drag.ghost = dragGhost(event);
    document.body.classList.add('is-dragging-calendar-event');
    navigator.vibrate?.(18);
    setDragStatus(drag.mode === 'time' ? '已选中，上下拖到新的半小时时间点' : '已选中，拖到月历中的目标日期');
    lastPoint = { x: tracking.lastX, y: tracking.lastY };
    updateDragTarget(lastPoint);
    scrollFrame = requestAnimationFrame(runTimelineScroll);
  }

  function trackPointerMove(event) {
    if (!tracking || event.pointerId !== tracking.pointerId) return;
    tracking.lastX = event.clientX;
    tracking.lastY = event.clientY;
    if (!drag) {
      if (tracking.blocked) return;
      if (Math.hypot(event.clientX - tracking.startX, event.clientY - tracking.startY) > MOVE_CANCEL_DISTANCE) stopTracking();
      return;
    }
    event.preventDefault();
    updateDragTarget({ x: event.clientX, y: event.clientY });
  }

  function finishPointer(event) {
    if (!tracking || event.pointerId !== tracking.pointerId) return;
    const activeDrag = drag;
    const blocked = tracking.blocked;
    stopTracking();
    if (!activeDrag) { if (blocked) suppressClickUntil = Date.now() + 650; return; }
    event.preventDefault();
    suppressClickUntil = Date.now() + 650;
    const targetDate = activeDrag.targetDate, targetTime = activeDrag.targetTime, original = activeDrag.event, mode = activeDrag.mode;
    cleanupDrag();
    if (mode === 'date' && targetDate) applyMove(original, { date: targetDate }, mode);
    else if (mode === 'time' && targetTime) applyMove(original, { date: original.date, time: targetTime }, mode);
    else showMoveToast('这次没有移动', mode === 'date' ? '请拖到月历中的某一天后松手' : '请拖到时间刻度上后松手');
  }

  function cancelPointer(event) {
    if (!tracking || event.pointerId !== tracking.pointerId) return;
    stopTracking();
    if (drag) cleanupDrag();
  }

  function beginTracking(event) {
    if (tracking || drag || (event.button !== undefined && event.button !== 0) || event.isPrimary === false) return;
    const origin = event.target instanceof Element ? event.target : null;
    if (!origin || origin.closest('[data-todo-check], button, a, input, textarea, select')) return;
    const source = origin.closest(EVENT_SELECTOR);
    if (!source) return;
    tracking = {
      pointerId: event.pointerId,
      eventId: source.dataset.eventId,
      source,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      timer: setTimeout(activateDrag, HOLD_DELAY),
    };
    window.addEventListener('pointermove', trackPointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', finishPointer, { capture: true, passive: false });
    window.addEventListener('pointercancel', cancelPointer, true);
  }

  function undoLastMove() {
    if (!undoSnapshot) return;
    const before = { ...undoSnapshot.before };
    persistMovedEvent(undoSnapshot.after, before);
    state.selected = new Date(`${before.date}T12:00:00`);
    state.showing = new Date(state.selected);
    undoSnapshot = null;
    render();
    showMoveToast('已撤销移动', `已恢复到 ${dateLabel(before.date)} · ${CalendarReschedule.timeLabel(before)}`);
  }

  document.addEventListener('pointerdown', beginTracking, true);
  document.addEventListener('contextmenu', (event) => { if (event.target.closest(EVENT_SELECTOR)) event.preventDefault(); }, true);
  document.addEventListener('touchmove', (event) => { if (drag) event.preventDefault(); }, { capture: true, passive: false });
  document.addEventListener('click', (event) => {
    if (Date.now() >= suppressClickUntil) return;
    if (!event.target.closest(EVENT_SELECTOR) && !event.target.closest('#previous-month, #next-month')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  $('undo-calendar-move').onclick = undoLastMove;
  $('close-calendar-move-toast').onclick = () => { undoSnapshot = null; hideMoveToast(); };
})();
