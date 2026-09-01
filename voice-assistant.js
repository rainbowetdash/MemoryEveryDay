const voiceAssistantStorageKey = 'memory-everyday-voice-provider-v1';
const voiceAssistant = {
  provider: localStorage.getItem(voiceAssistantStorageKey) || (/^zh\b/i.test(navigator.language || '') ? 'deepseek' : 'openai'),
  quota: { limit: 10, used: 0, remaining: 10 },
  configured: { deepseek: false, openai: false },
  listening: false,
  recognitionEnded: false,
  stopRequested: false,
  processing: false,
  transcript: '',
  committedTranscript: '',
  recognitionRestartTimer: null,
  requestId: '',
  startedAt: 0,
  timer: null,
  recognition: null,
  lastEvents: [],
  lastMemos: [],
};

function voiceTimezone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } }
function voiceNativeBridge() {
  if (window.webkit?.messageHandlers?.audio?.postMessage) return { platform: 'ios', post: (message) => window.webkit.messageHandlers.audio.postMessage(message) };
  if (window.MemoryEveryDayVoice?.postMessage) return { platform: 'android', post: (message) => window.MemoryEveryDayVoice.postMessage(JSON.stringify(message)) };
  return null;
}
function voiceWebRecognitionClass() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
function voiceHasRecognition() { return Boolean(voiceNativeBridge() || voiceWebRecognitionClass()); }
function voiceIsScheduleText(text) {
  const date = /(今天|明天|后天|大后天|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}[月/]\d{1,2}([日号])?|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[:：点时]\d{0,2}|上午|中午|下午|傍晚|晚上|凌晨|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(:\d{2})?\s?(am|pm))/i;
  const action = /(待办|日程|安排|提醒|备忘录|课程|上课|会议|作业|任务|复习|整理|完成|提交|截止|预约|考试|学习|写|做|去|买|读|看|交|打电话|schedule|todo|task|memo|note|remind|class|meeting|homework|review|study|finish|submit|appointment|exam|go|buy|read|write|call)/i;
  return /(创建|新增|添加|记下|帮我安排|加入日程|加入待办|创建备忘录|create|add|put on my calendar)/i.test(text) || (date.test(text) && action.test(text));
}
function formatVoiceDuration(milliseconds) { const seconds = Math.max(0, Math.floor(milliseconds / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function selectedVoiceProviderName() { return voiceAssistant.provider === 'openai' ? 'ChatGPT' : 'DeepSeek'; }
function setVoiceMessage(message = '', tone = '') { const element = $('voice-inline-message'); if (!element) return; element.textContent = message; element.dataset.tone = tone; }

function renderVoiceAssistant() {
  const screen = $('voice-assistant-screen');
  if (!screen) return;
  document.querySelectorAll('[data-voice-provider]').forEach((button) => {
    const selected = button.dataset.voiceProvider === voiceAssistant.provider;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('voice-quota-remaining').textContent = state.user ? String(voiceAssistant.quota.remaining) : '—';
  $('voice-quota-label').textContent = state.user ? `今日剩余 / ${voiceAssistant.quota.limit}` : '登录后可用';
  const card = $('voice-assistant-card'), mic = $('voice-mic-button');
  card.classList.toggle('is-listening', voiceAssistant.listening);
  card.classList.toggle('is-processing', voiceAssistant.processing);
  const configured = voiceAssistant.configured[voiceAssistant.provider];
  mic.disabled = voiceAssistant.processing || (Boolean(state.user) && (voiceAssistant.quota.remaining <= 0 || !configured));
  $('voice-record-time').textContent = voiceAssistant.listening ? formatVoiceDuration(Date.now() - voiceAssistant.startedAt) : voiceAssistant.processing ? '请稍候' : '';
  const transcript = voiceAssistant.transcript.trim();
  $('voice-transcript').textContent = transcript || '例如：创建待办，明晚八点复习 ACE 264';
  $('voice-transcript').classList.toggle('is-placeholder', !transcript);

  let status = '点一下开始说', hint = `使用 ${selectedVoiceProviderName()} 创建待办、日程或关联备忘录`;
  if (!state.user) { status = '点麦克风登录后使用'; hint = '登录窗口会直接打开，不需要重复登录'; }
  else if (voiceAssistant.quota.remaining <= 0) { status = '今天的 10 次已经用完'; hint = '明天会自动恢复额度'; }
  else if (!configured) { status = `${selectedVoiceProviderName()} 等待启用`; hint = '服务密钥配置后无需更新 App 即可使用'; }
  else if (voiceAssistant.processing) { status = '正在整理你的安排…'; hint = '可以先去其他页面，创建完成后会同步显示'; }
  else if (voiceAssistant.listening) { status = '正在听…'; hint = '可以连续说多句话，说完后再点一下'; }
  else if (!voiceHasRecognition()) { status = '当前设备不能直接听写'; hint = '请使用 iPhone 或 Android App'; }
  $('voice-assistant-status').textContent = status;
  $('voice-assistant-hint').textContent = hint;
}

async function voiceApi(path = '', options = {}) {
  if (!supabaseClient || !state.user) throw new Error('unauthorized');
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('unauthorized');
  const response = await fetch(`${supabaseUrl}/functions/v1/voice-assistant${path}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabasePublishableKey, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(payload.message || '语音助手暂时不可用'); error.code = payload.code || 'request_failed'; error.payload = payload; throw error; }
  return payload;
}

async function refreshVoiceQuota() {
  if (!state.user) { voiceAssistant.quota = { limit: 10, used: 0, remaining: 10 }; voiceAssistant.configured = { deepseek: false, openai: false }; renderVoiceAssistant(); return; }
  try {
    const result = await voiceApi(`?timezone=${encodeURIComponent(voiceTimezone())}`, { method: 'GET' });
    voiceAssistant.quota = { limit: Number(result.limit || 10), used: Number(result.used || 0), remaining: Number(result.remaining ?? 10) };
    voiceAssistant.configured = { deepseek: Boolean(result.configured?.deepseek), openai: Boolean(result.configured?.openai) };
    setVoiceMessage('');
  } catch (error) {
    voiceAssistant.configured = { deepseek: false, openai: false };
    setVoiceMessage(error.message || '暂时无法读取语音助手状态');
  }
  renderVoiceAssistant();
}

function startVoiceTimer() {
  clearInterval(voiceAssistant.timer);
  voiceAssistant.timer = setInterval(() => renderVoiceAssistant(), 250);
}
function stopVoiceTimer() { clearInterval(voiceAssistant.timer); voiceAssistant.timer = null; }
function joinVoiceParts(...parts) { return parts.map((part) => String(part || '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); }
function setVoiceTranscript(text) { if (String(text || '').trim()) voiceAssistant.transcript = String(text).trim(); renderVoiceAssistant(); }
function finishWebVoiceListening() {
  voiceAssistant.listening = false;
  voiceAssistant.stopRequested = false;
  stopVoiceTimer();
  if (voiceAssistant.transcript.trim()) void submitVoiceTranscript(voiceAssistant.transcript, voiceAssistant.requestId);
  else finishVoiceListeningError('没有听到清晰的安排，请重新说一次。');
}

function startWebVoiceRecognition() {
  const Recognition = voiceWebRecognitionClass();
  if (!Recognition) throw new Error('unsupported');
  const prefix = voiceAssistant.committedTranscript.trim();
  const recognition = new Recognition();
  recognition.lang = navigator.language || 'zh-CN';
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    let currentSession = '';
    for (let index = 0; index < event.results.length; index += 1) currentSession = joinVoiceParts(currentSession, event.results[index][0]?.transcript || '');
    setVoiceTranscript(joinVoiceParts(prefix, currentSession));
  };
  recognition.onerror = (event) => {
    if (event.error === 'aborted' || event.error === 'no-speech') return;
    finishVoiceListeningError(event.error === 'not-allowed' ? '没有获得麦克风权限，请在浏览器设置中允许使用麦克风。' : '这次没有听清，请重新说一次。');
  };
  recognition.onend = () => {
    voiceAssistant.recognition = null;
    if (!voiceAssistant.listening) return;
    voiceAssistant.committedTranscript = voiceAssistant.transcript.trim();
    if (voiceAssistant.stopRequested) { finishWebVoiceListening(); return; }
    clearTimeout(voiceAssistant.recognitionRestartTimer);
    voiceAssistant.recognitionRestartTimer = setTimeout(() => {
      if (!voiceAssistant.listening || voiceAssistant.stopRequested) return;
      try { startWebVoiceRecognition(); }
      catch { finishVoiceListeningError('当前设备不能直接听写，请使用 iPhone 或 Android App。'); }
    }, 180);
  };
  voiceAssistant.recognition = recognition;
  recognition.start();
}

function startVoiceListening() {
  if (!state.user) { openAuthDialog('login'); return; }
  if (voiceAssistant.processing) return;
  if (!voiceAssistant.configured[voiceAssistant.provider]) { setVoiceMessage(`${selectedVoiceProviderName()} 服务尚未启用，配置密钥后即可使用。`); return; }
  if (voiceAssistant.quota.remaining <= 0) { setVoiceMessage('今天的 10 次额度已经用完，明天会自动恢复。'); return; }
  voiceAssistant.listening = true;
  voiceAssistant.recognitionEnded = false;
  voiceAssistant.stopRequested = false;
  voiceAssistant.transcript = '';
  voiceAssistant.committedTranscript = '';
  voiceAssistant.requestId = crypto.randomUUID();
  voiceAssistant.startedAt = Date.now();
  setVoiceMessage('');
  startVoiceTimer();
  renderVoiceAssistant();
  const bridge = voiceNativeBridge();
  if (bridge) {
    bridge.post({ action: 'start-live', requestId: voiceAssistant.requestId, locale: navigator.language || 'zh-CN' });
    return;
  }
  try { startWebVoiceRecognition(); }
  catch { finishVoiceListeningError('当前设备不能直接听写，请使用 iPhone 或 Android App。'); }
}

function finishVoiceListeningError(message) {
  voiceAssistant.listening = false;
  voiceAssistant.recognitionEnded = false;
  voiceAssistant.stopRequested = false;
  voiceAssistant.recognition = null;
  clearTimeout(voiceAssistant.recognitionRestartTimer);
  voiceAssistant.recognitionRestartTimer = null;
  stopVoiceTimer();
  setVoiceMessage(message);
  renderVoiceAssistant();
}

function stopVoiceListening() {
  if (!voiceAssistant.listening) return;
  voiceAssistant.stopRequested = true;
  clearTimeout(voiceAssistant.recognitionRestartTimer);
  voiceAssistant.recognitionRestartTimer = null;
  const bridge = voiceNativeBridge();
  if (bridge) bridge.post({ action: 'stop-live', requestId: voiceAssistant.requestId });
  else if (voiceAssistant.recognition) {
    try { voiceAssistant.recognition.stop(); }
    catch { finishWebVoiceListening(); }
  } else finishWebVoiceListening();
}

function voiceResultDate(event) {
  try { return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${event.date}T12:00:00`)); }
  catch { return event.date; }
}
function renderVoiceResult(events, memos, message) {
  voiceAssistant.lastEvents = events;
  voiceAssistant.lastMemos = memos;
  const result = $('voice-result');
  if (!events.length) { result.classList.add('is-hidden'); return; }
  result.classList.remove('is-hidden');
  const total = events.length + memos.length;
  $('voice-result-title').textContent = memos.length ? `已创建 ${total} 项内容` : `已创建 ${events.length} 项安排`;
  $('voice-result-copy').textContent = message || (memos.length ? '安排和关联备忘录都已同步' : '已经同步到你的日历和日程');
  $('voice-result-list').innerHTML = events.map((event) => {
    const linkedMemo = memos.find((memo) => memo.eventId === event.id);
    const type = event.kind === 'todo' ? '待办' : '日程';
    return `<div class="voice-result-item"><i>${event.kind === 'todo' ? '□' : '◷'}</i><span><strong>${escapeHtml(event.title)}</strong><small>${type} · ${escapeHtml(voiceResultDate(event))}${linkedMemo ? ' · 已关联备忘录' : ''}</small></span><time>${escapeHtml(event.time)}${event.endTime ? `–${escapeHtml(event.endTime)}` : ''}</time></div>`;
  }).join('');
  $('undo-voice-result').disabled = false;
  $('undo-voice-result').textContent = '撤销本次创建';
}

async function applyVoiceCreationResult(result) {
  voiceAssistant.quota = { limit: Number(result.limit || 10), used: Number(result.used || 0), remaining: Number(result.remaining ?? voiceAssistant.quota.remaining) };
  const events = Array.isArray(result.events) ? result.events : [];
  const memos = Array.isArray(result.memos) ? result.memos : [];
  if (!events.length) {
    renderVoiceResult([], [], '');
    setVoiceMessage(result.message || '没有找到日期和开始时间，请补充后再试。');
    return;
  }
  await fetchCloudEvents();
  await fetchMemos();
  const confirmed = new Set(state.events.map((event) => event.id));
  const confirmedMemos = new Set(state.memos.map((memo) => memo.id));
  if (!events.every((event) => confirmed.has(event.id)) || !memos.every((memo) => confirmedMemos.has(memo.id))) throw new Error('创建已经提交，但同步确认失败，请稍后刷新查看。');
  events.forEach(scheduleNativeNotification);
  renderVoiceResult(events, memos, result.message);
  setVoiceMessage(result.message || `已创建 ${events.length} 项安排${memos.length ? `和 ${memos.length} 份关联备忘录` : ''}`, 'success');
}

async function waitForVoiceCreation(requestId) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 700 + attempt * 250));
    const result = await voiceApi(`?requestId=${encodeURIComponent(requestId)}&timezone=${encodeURIComponent(voiceTimezone())}`, { method: 'GET' });
    if (result.status === 'completed' || Array.isArray(result.events)) return result;
  }
  throw new Error('创建仍在后台处理中，请稍后刷新日程查看。');
}

async function submitVoiceTranscript(text, requestId = crypto.randomUUID()) {
  const transcript = String(text || '').trim();
  voiceAssistant.listening = false;
  voiceAssistant.recognitionEnded = false;
  voiceAssistant.stopRequested = false;
  stopVoiceTimer();
  if (!transcript) { finishVoiceListeningError('没有听到清晰的安排，请重新说一次。'); return; }
  voiceAssistant.transcript = transcript;
  if (!voiceIsScheduleText(transcript)) {
    setVoiceMessage('这段内容与待办、日程或关联备忘录无关，没有交给 AI，也不会消耗次数。');
    renderVoiceAssistant();
    return;
  }
  voiceAssistant.processing = true;
  setVoiceMessage('');
  renderVoiceAssistant();
  try {
    const result = await voiceApi('', { method: 'POST', body: JSON.stringify({ text: transcript, provider: voiceAssistant.provider, timezone: voiceTimezone(), locale: navigator.language || 'zh-CN', requestId }) });
    await applyVoiceCreationResult(result);
  } catch (error) {
    try {
      const recovered = await waitForVoiceCreation(requestId);
      await applyVoiceCreationResult(recovered);
    } catch {
      if (error.payload && Number.isFinite(Number(error.payload.remaining))) voiceAssistant.quota.remaining = Number(error.payload.remaining);
      setVoiceMessage(error.message || '这次安排没有创建成功，请稍后再试。');
    }
  } finally {
    voiceAssistant.processing = false;
    renderVoiceAssistant();
  }
}

async function undoVoiceResult() {
  const events = voiceAssistant.lastEvents.filter((event) => event?.id);
  const memos = voiceAssistant.lastMemos.filter((memo) => memo?.id);
  if (!events.length || !state.user) return;
  const button = $('undo-voice-result');
  button.disabled = true;
  button.textContent = '正在撤销…';
  const ids = events.map((event) => event.id);
  if (memos.length) {
    const { error: memoError } = await supabaseClient.from('memos').delete().in('id', memos.map((memo) => memo.id)).eq('user_id', state.user.id);
    if (memoError) { button.disabled = false; button.textContent = '撤销本次创建'; setVoiceMessage('暂时无法撤销关联备忘录，请到备忘录中删除。'); return; }
  }
  const { error } = await supabaseClient.from('schedule_events').delete().in('id', ids).eq('user_id', state.user.id);
  if (error) { button.disabled = false; button.textContent = '撤销本次创建'; setVoiceMessage('暂时无法撤销，请到日程中删除。'); return; }
  ids.forEach(cancelNativeNotification);
  voiceAssistant.lastEvents = [];
  voiceAssistant.lastMemos = [];
  await fetchCloudEvents();
  await fetchMemos();
  $('voice-result').classList.add('is-hidden');
  setVoiceMessage('已撤销本次创建，使用次数不会退回。', 'success');
}

function openVoiceResultInCalendar() {
  const first = voiceAssistant.lastEvents[0];
  if (!first) return;
  state.selected = new Date(`${first.date}T12:00:00`);
  state.showing = new Date(state.selected);
  activateInterfaceScreen('calendar-screen');
  render();
}

window.addEventListener('memoryeveryday-native-voice-assistant', (event) => {
  const detail = event.detail || {};
  if (!voiceAssistant.listening || detail.requestId !== voiceAssistant.requestId) return;
  if (detail.text) setVoiceTranscript(detail.text);
  if (detail.status === 'listening' || detail.status === 'partial') return;
  if (detail.status === 'ready') { voiceAssistant.recognitionEnded = true; renderVoiceAssistant(); return; }
  if (detail.status === 'success') {
    voiceAssistant.listening = false;
    stopVoiceTimer();
    if (String(detail.text || voiceAssistant.transcript).trim()) void submitVoiceTranscript(detail.text || voiceAssistant.transcript, voiceAssistant.requestId);
    else finishVoiceListeningError(detail.message || '没有听到清晰的安排，请重新说一次。');
    return;
  }
  if (detail.status === 'failed') finishVoiceListeningError(detail.message || '这次没有听清，请重新说一次。');
});

document.querySelectorAll('[data-voice-provider]').forEach((button) => {
  button.onclick = () => {
    if (voiceAssistant.processing || voiceAssistant.listening) return;
    voiceAssistant.provider = button.dataset.voiceProvider === 'openai' ? 'openai' : 'deepseek';
    localStorage.setItem(voiceAssistantStorageKey, voiceAssistant.provider);
    setVoiceMessage('');
    renderVoiceAssistant();
  };
});
$('voice-mic-button').onclick = () => voiceAssistant.listening ? stopVoiceListening() : startVoiceListening();
$('undo-voice-result').onclick = () => void undoVoiceResult();
$('view-voice-result').onclick = openVoiceResultInCalendar;
document.addEventListener('click', (event) => { if (event.target.closest('[data-screen="voice-assistant-screen"]')) setTimeout(() => void refreshVoiceQuota(), 0); });
if (supabaseClient) supabaseClient.auth.onAuthStateChange(() => setTimeout(() => void refreshVoiceQuota(), 80));
renderVoiceAssistant();
setTimeout(() => void refreshVoiceQuota(), 120);
