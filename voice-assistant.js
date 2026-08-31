const voiceAssistantStorageKey = 'memory-everyday-voice-provider-v1';
const voiceAssistant = {
  provider: localStorage.getItem(voiceAssistantStorageKey) || (/^zh\b/i.test(navigator.language || '') ? 'deepseek' : 'openai'),
  quota: { limit: 10, used: 0, remaining: 10 },
  configured: { deepseek: false, openai: false },
  listening: false,
  recognitionEnded: false,
  processing: false,
  transcript: '',
  requestId: '',
  startedAt: 0,
  timer: null,
  recognition: null,
  lastEvents: [],
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
  const action = /(待办|日程|安排|提醒|课程|上课|会议|作业|任务|复习|整理|完成|提交|截止|预约|考试|学习|写|做|去|买|读|看|交|打电话|schedule|todo|task|remind|class|meeting|homework|review|study|finish|submit|appointment|exam|go|buy|read|write|call)/i;
  return /(创建|新增|添加|记下|帮我安排|加入日程|加入待办|create|add|put on my calendar)/i.test(text) || (date.test(text) && action.test(text));
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
  $('voice-account-gate').classList.toggle('is-hidden', Boolean(state.user));
  $('voice-text-entry').classList.toggle('is-hidden', !state.user);
  const card = $('voice-assistant-card'), mic = $('voice-mic-button');
  card.classList.toggle('is-listening', voiceAssistant.listening);
  card.classList.toggle('is-processing', voiceAssistant.processing);
  const configured = voiceAssistant.configured[voiceAssistant.provider];
  mic.disabled = voiceAssistant.processing || !state.user || voiceAssistant.quota.remaining <= 0 || !configured;
  $('voice-text-submit').disabled = voiceAssistant.processing || !state.user || voiceAssistant.quota.remaining <= 0 || !configured;
  $('voice-record-time').textContent = voiceAssistant.listening ? formatVoiceDuration(Date.now() - voiceAssistant.startedAt) : voiceAssistant.processing ? '请稍候' : '';
  const transcript = voiceAssistant.transcript.trim();
  $('voice-transcript').textContent = transcript || '例如：明天下午三点到四点复习 ACE 264，创建为待办';
  $('voice-transcript').classList.toggle('is-placeholder', !transcript);

  let status = '点一下开始说', hint = `使用 ${selectedVoiceProviderName()} 整理为待办或日程`;
  if (!state.user) { status = '登录后使用语音助手'; hint = '安排会直接同步到你的账号'; }
  else if (voiceAssistant.quota.remaining <= 0) { status = '今天的 10 次已经用完'; hint = '明天会自动恢复额度'; }
  else if (!configured) { status = `${selectedVoiceProviderName()} 等待启用`; hint = '服务密钥配置后无需更新 App 即可使用'; }
  else if (voiceAssistant.processing) { status = '正在整理你的安排…'; hint = '可以先去其他页面，创建完成后会同步显示'; }
  else if (voiceAssistant.listening && voiceAssistant.recognitionEnded) { status = '已听到，点一下完成'; hint = '也可以继续重新说一次'; }
  else if (voiceAssistant.listening) { status = '正在听…'; hint = '说完后再点一下按钮'; }
  else if (!voiceHasRecognition()) { status = '当前浏览器不能直接听写'; hint = '可以在下方输入安排，或使用手机 App'; }
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
function setVoiceTranscript(text) { if (String(text || '').trim()) voiceAssistant.transcript = String(text).trim(); renderVoiceAssistant(); }

function startWebVoiceRecognition() {
  const Recognition = voiceWebRecognitionClass();
  if (!Recognition) throw new Error('unsupported');
  const recognition = new Recognition();
  recognition.lang = navigator.language || 'zh-CN';
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    let text = '';
    for (let index = 0; index < event.results.length; index += 1) text += `${event.results[index][0]?.transcript || ''} `;
    setVoiceTranscript(text);
  };
  recognition.onerror = (event) => {
    if (event.error === 'aborted' || event.error === 'no-speech') return;
    finishVoiceListeningError(event.error === 'not-allowed' ? '没有获得麦克风权限，请在浏览器设置中允许使用麦克风。' : '这次没有听清，请重新说一次。');
  };
  recognition.onend = () => {
    voiceAssistant.recognition = null;
    if (!voiceAssistant.listening) return;
    voiceAssistant.recognitionEnded = true;
    renderVoiceAssistant();
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
  voiceAssistant.transcript = '';
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
  catch { finishVoiceListeningError('当前浏览器不能直接听写，请在下方输入安排，或使用手机 App。'); }
}

function finishVoiceListeningError(message) {
  voiceAssistant.listening = false;
  voiceAssistant.recognitionEnded = false;
  voiceAssistant.recognition = null;
  stopVoiceTimer();
  setVoiceMessage(message);
  renderVoiceAssistant();
}

function stopVoiceListening() {
  if (!voiceAssistant.listening) return;
  if (voiceAssistant.recognitionEnded && voiceAssistant.transcript.trim()) { voiceAssistant.listening = false; stopVoiceTimer(); void submitVoiceTranscript(voiceAssistant.transcript, voiceAssistant.requestId); return; }
  const bridge = voiceNativeBridge();
  if (bridge) bridge.post({ action: 'stop-live', requestId: voiceAssistant.requestId });
  else if (voiceAssistant.recognition) {
    const recognition = voiceAssistant.recognition;
    recognition.onend = () => {
      voiceAssistant.recognition = null;
      voiceAssistant.listening = false;
      stopVoiceTimer();
      if (voiceAssistant.transcript.trim()) void submitVoiceTranscript(voiceAssistant.transcript, voiceAssistant.requestId);
      else finishVoiceListeningError('没有听到清晰的安排，请重新说一次。');
    };
    recognition.stop();
  } else {
    voiceAssistant.listening = false;
    stopVoiceTimer();
    if (voiceAssistant.transcript.trim()) void submitVoiceTranscript(voiceAssistant.transcript, voiceAssistant.requestId);
    else finishVoiceListeningError('没有听到清晰的安排，请重新说一次。');
  }
}

function voiceResultDate(event) {
  try { return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${event.date}T12:00:00`)); }
  catch { return event.date; }
}
function renderVoiceResult(events, message) {
  voiceAssistant.lastEvents = events;
  const result = $('voice-result');
  if (!events.length) { result.classList.add('is-hidden'); return; }
  result.classList.remove('is-hidden');
  $('voice-result-title').textContent = `已创建 ${events.length} 项安排`;
  $('voice-result-copy').textContent = message || '已经同步到你的日历和日程';
  $('voice-result-list').innerHTML = events.map((event) => `<div class="voice-result-item"><i>${event.kind === 'todo' ? '□' : '◷'}</i><span><strong>${escapeHtml(event.title)}</strong><small>${event.kind === 'todo' ? '待办' : '日程'} · ${escapeHtml(voiceResultDate(event))}</small></span><time>${escapeHtml(event.time)}${event.endTime ? `–${escapeHtml(event.endTime)}` : ''}</time></div>`).join('');
  $('undo-voice-result').disabled = false;
  $('undo-voice-result').textContent = '撤销本次创建';
}

async function submitVoiceTranscript(text, requestId = crypto.randomUUID()) {
  const transcript = String(text || '').trim();
  voiceAssistant.listening = false;
  voiceAssistant.recognitionEnded = false;
  stopVoiceTimer();
  if (!transcript) { finishVoiceListeningError('没有听到清晰的安排，请重新说一次。'); return; }
  voiceAssistant.transcript = transcript;
  if (!voiceIsScheduleText(transcript)) {
    setVoiceMessage('这段内容与日程、待办或每日安排无关，没有交给 AI，也不会消耗次数。');
    renderVoiceAssistant();
    return;
  }
  voiceAssistant.processing = true;
  setVoiceMessage('');
  renderVoiceAssistant();
  try {
    const result = await voiceApi('', { method: 'POST', body: JSON.stringify({ text: transcript, provider: voiceAssistant.provider, timezone: voiceTimezone(), locale: navigator.language || 'zh-CN', requestId }) });
    voiceAssistant.quota = { limit: Number(result.limit || 10), used: Number(result.used || 0), remaining: Number(result.remaining ?? voiceAssistant.quota.remaining) };
    const events = Array.isArray(result.events) ? result.events : [];
    if (events.length) {
      const merged = new Map(state.events.map((event) => [event.id, event]));
      events.forEach((event) => { merged.set(event.id, event); scheduleNativeNotification(event); });
      state.events = Array.from(merged.values());
      save();
      render();
      renderVoiceResult(events, result.message);
      setVoiceMessage(result.message || `已创建 ${events.length} 项安排`, 'success');
    } else {
      renderVoiceResult([], '');
      setVoiceMessage(result.message || '没有找到日期和开始时间，请补充后再试。');
    }
  } catch (error) {
    if (error.payload && Number.isFinite(Number(error.payload.remaining))) voiceAssistant.quota.remaining = Number(error.payload.remaining);
    setVoiceMessage(error.message || '这次安排没有创建成功，请稍后再试。');
  } finally {
    voiceAssistant.processing = false;
    renderVoiceAssistant();
  }
}

async function undoVoiceResult() {
  const events = voiceAssistant.lastEvents.filter((event) => event?.id);
  if (!events.length || !state.user) return;
  const button = $('undo-voice-result');
  button.disabled = true;
  button.textContent = '正在撤销…';
  const ids = events.map((event) => event.id);
  const { error } = await supabaseClient.from('schedule_events').delete().in('id', ids).eq('user_id', state.user.id);
  if (error) { button.disabled = false; button.textContent = '撤销本次创建'; setVoiceMessage('暂时无法撤销，请到日程中删除。'); return; }
  ids.forEach(cancelNativeNotification);
  state.events = state.events.filter((event) => !ids.includes(event.id));
  voiceAssistant.lastEvents = [];
  save();
  render();
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
$('voice-login-button').onclick = () => openAuthDialog('login');
$('voice-text-entry').addEventListener('submit', (event) => { event.preventDefault(); const input = $('voice-text-input'), text = input.value.trim(); if (!text) { setVoiceMessage('请先输入一项带有日期和时间的安排。'); input.focus(); return; } voiceAssistant.transcript = text; input.value = ''; void submitVoiceTranscript(text); });
$('undo-voice-result').onclick = () => void undoVoiceResult();
$('view-voice-result').onclick = openVoiceResultInCalendar;
document.addEventListener('click', (event) => { if (event.target.closest('[data-screen="voice-assistant-screen"]')) setTimeout(() => void refreshVoiceQuota(), 0); });
if (supabaseClient) supabaseClient.auth.onAuthStateChange(() => setTimeout(() => void refreshVoiceQuota(), 80));
renderVoiceAssistant();
setTimeout(() => void refreshVoiceQuota(), 120);
