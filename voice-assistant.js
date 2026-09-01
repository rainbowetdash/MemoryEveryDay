const voiceAssistantStorageKey = 'memory-everyday-voice-provider-v1';
const voiceAssistant = {
  provider: localStorage.getItem(voiceAssistantStorageKey) || (/^zh\b/i.test(navigator.language || '') ? 'deepseek' : 'openai'),
  quota: { limit: 10, used: 0, remaining: 10, unlimited: false },
  configured: { deepseek: false, openai: false, transcription: false },
  listening: false,
  recognitionEnded: false,
  stopRequested: false,
  processing: false,
  reviewing: false,
  transcript: '',
  committedTranscript: '',
  recognitionRestartTimer: null,
  requestId: '',
  startedAt: 0,
  timer: null,
  recognition: null,
  captureMode: '',
  audioRecorder: null,
  audioStream: null,
  audioChunks: [],
  audioStopTimer: null,
  lastEvents: [],
  lastMemos: [],
};

function voiceTimezone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } }
function voiceNativeBridge() {
  if (window.webkit?.messageHandlers?.audio?.postMessage) return { platform: 'ios', post: (message) => window.webkit.messageHandlers.audio.postMessage(message) };
  if (window.MemoryEveryDayVoice?.postMessage) return { platform: 'android', post: (message) => window.MemoryEveryDayVoice.postMessage(JSON.stringify(message)) };
  return null;
}
function voiceLocale() { const locale = navigator.language || 'zh-CN'; return /^zh(?:-|$)/i.test(locale) ? 'zh-CN' : locale; }
function voiceWebRecognitionClass() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
function voiceCanRecordAudio() { return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder); }
function voiceHasRecognition() { return Boolean(voiceNativeBridge() || voiceWebRecognitionClass() || voiceCanRecordAudio()); }
function voiceNeedsAudioFallback(detail = {}) { return detail.status === 'fallback' || (detail.status === 'failed' && /语音识别暂不可用|没有启用可用的语音识别服务/.test(String(detail.message || ''))); }
function voiceIsScheduleText(text) {
  const date = /(今天|明天|后天|大后天|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}[月/]\d{1,2}([日号])?|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[:：点时]\d{0,2}|上午|中午|下午|傍晚|晚上|凌晨|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(:\d{2})?\s?(am|pm))/i;
  const action = /(待办|日程|安排|提醒|备忘录|课程|上课|会议|作业|任务|复习|整理|完成|提交|截止|预约|考试|学习|写|做|去|买|读|看|交|打电话|第一个|上一项|下一项|之后|之前|空档|有空|schedule|todo|task|memo|note|remind|class|meeting|homework|assignment|review|study|finish|submit|appointment|exam|after|before|first|next|go|buy|read|write|call)/i;
  return /(创建|新增|添加|记下|帮我安排|加入日程|加入待办|创建备忘录|想在|安排在|create|add|schedule|put on my calendar)/i.test(text) || (date.test(text) && action.test(text));
}
function formatVoiceDuration(milliseconds) { const seconds = Math.max(0, Math.floor(milliseconds / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function selectedVoiceProviderName() { return voiceAssistant.provider === 'openai' ? 'ChatGPT' : 'DeepSeek'; }
function setVoiceMessage(message = '', tone = '') { const element = $('voice-inline-message'); if (!element) return; element.textContent = message; element.dataset.tone = tone; }
function normalizedVoiceQuota(payload = {}) {
  const unlimited = payload.unlimited === true;
  return {
    limit: unlimited ? null : Number(payload.limit || 10),
    used: Number(payload.used || 0),
    remaining: unlimited ? null : Number(payload.remaining ?? 10),
    unlimited,
  };
}
function voiceQuotaExhausted() { return !voiceAssistant.quota.unlimited && Number(voiceAssistant.quota.remaining || 0) <= 0; }

function renderVoiceAssistant() {
  const screen = $('voice-assistant-screen');
  if (!screen) return;
  document.querySelectorAll('[data-voice-provider]').forEach((button) => {
    const selected = button.dataset.voiceProvider === voiceAssistant.provider;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('voice-quota-remaining').textContent = state.user ? (voiceAssistant.quota.unlimited ? '∞' : String(voiceAssistant.quota.remaining)) : '—';
  $('voice-quota-label').textContent = state.user ? (voiceAssistant.quota.unlimited ? '专属账号 · 不限次数' : `今日剩余 / ${voiceAssistant.quota.limit}`) : '登录后可用';
  const card = $('voice-assistant-card'), mic = $('voice-mic-button');
  card.classList.toggle('is-listening', voiceAssistant.listening);
  card.classList.toggle('is-processing', voiceAssistant.processing);
  card.classList.toggle('is-reviewing', voiceAssistant.reviewing);
  const configured = voiceAssistant.configured[voiceAssistant.provider];
  mic.disabled = voiceAssistant.processing || voiceAssistant.reviewing || (Boolean(state.user) && (voiceQuotaExhausted() || !configured));
  $('voice-record-time').textContent = voiceAssistant.listening ? formatVoiceDuration(Date.now() - voiceAssistant.startedAt) : voiceAssistant.processing ? '请稍候' : '';
  const transcript = voiceAssistant.transcript.trim();
  $('voice-transcript').textContent = transcript || '例如：创建待办，明晚八点复习 ACE 264';
  $('voice-transcript').classList.toggle('is-placeholder', !transcript);
  $('voice-transcript').classList.toggle('is-hidden', voiceAssistant.reviewing);
  $('voice-review').classList.toggle('is-hidden', !voiceAssistant.reviewing);
  $('voice-review-actions').classList.toggle('is-hidden', !voiceAssistant.reviewing);
  $('voice-transcript-editor').disabled = voiceAssistant.processing;
  $('retry-voice-transcript').disabled = voiceAssistant.processing;
  $('confirm-voice-transcript').disabled = voiceAssistant.processing;

  let status = '点一下开始说', hint = `使用 ${selectedVoiceProviderName()} 创建待办、日程或关联备忘录`;
  if (!state.user) { status = '点麦克风登录后使用'; hint = '登录窗口会直接打开，不需要重复登录'; }
  else if (voiceQuotaExhausted()) { status = '今天的 10 次已经用完'; hint = '明天会自动恢复额度'; }
  else if (!configured) { status = `${selectedVoiceProviderName()} 等待启用`; hint = '服务密钥配置后无需更新 App 即可使用'; }
  else if (voiceAssistant.processing && voiceAssistant.captureMode === 'audio-transcribing') { status = '正在把语音转成文字…'; hint = '识别完成后可以先修改，再确认创建'; }
  else if (voiceAssistant.processing) { status = '正在理解并创建安排…'; hint = '会结合你已有的日程判断相对时间'; }
  else if (voiceAssistant.reviewing) { status = '请检查识别结果'; hint = '中英文都可以修改，确认后才会真正创建'; }
  else if (voiceAssistant.listening) { status = '正在听…'; hint = ['audio', 'native-audio'].includes(voiceAssistant.captureMode) ? '兼容录音模式，说完后再点一下' : '可以连续说多句话，说完后再点一下'; }
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

async function voiceAudioApi(audio, requestId) {
  if (!supabaseClient || !state.user) throw new Error('unauthorized');
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('unauthorized');
  const type = audio.type || 'audio/webm';
  const extension = /mp4|aac|m4a/i.test(type) ? 'm4a' : /ogg/i.test(type) ? 'ogg' : 'webm';
  const body = new FormData();
  body.append('audio', audio, `voice-${requestId}.${extension}`);
  body.append('locale', voiceLocale());
  body.append('timezone', voiceTimezone());
  const response = await fetch(`${supabaseUrl}/functions/v1/voice-assistant/transcribe`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabasePublishableKey },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(payload.message || '暂时无法把语音转成文字'); error.code = payload.code || 'transcription_failed'; throw error; }
  return String(payload.text || '').trim();
}

async function refreshVoiceQuota() {
  if (!state.user) { voiceAssistant.quota = { limit: 10, used: 0, remaining: 10, unlimited: false }; voiceAssistant.configured = { deepseek: false, openai: false, transcription: false }; renderVoiceAssistant(); return; }
  try {
    const result = await voiceApi(`?timezone=${encodeURIComponent(voiceTimezone())}`, { method: 'GET' });
    voiceAssistant.quota = normalizedVoiceQuota(result);
    voiceAssistant.configured = { deepseek: Boolean(result.configured?.deepseek), openai: Boolean(result.configured?.openai), transcription: Boolean(result.configured?.transcription) };
    setVoiceMessage('');
  } catch (error) {
    voiceAssistant.configured = { deepseek: false, openai: false, transcription: false };
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
function beginVoiceTranscriptReview(text) {
  const transcript = String(text || '').trim();
  voiceAssistant.listening = false;
  voiceAssistant.stopRequested = false;
  voiceAssistant.processing = false;
  voiceAssistant.captureMode = '';
  stopVoiceTimer();
  if (!transcript) { finishVoiceListeningError('没有听到清晰的安排，请重新说一次。'); return; }
  voiceAssistant.transcript = transcript;
  voiceAssistant.reviewing = true;
  $('voice-transcript-editor').value = transcript;
  setVoiceMessage('识别有误可以直接修改，确认前不会创建，也不会消耗次数。');
  renderVoiceAssistant();
  requestAnimationFrame(() => {
    const editor = $('voice-transcript-editor');
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(editor.value.length, editor.value.length);
  });
}
function finishWebVoiceListening() {
  voiceAssistant.listening = false;
  voiceAssistant.stopRequested = false;
  voiceAssistant.captureMode = '';
  stopVoiceTimer();
  if (voiceAssistant.transcript.trim()) beginVoiceTranscriptReview(voiceAssistant.transcript);
  else finishVoiceListeningError('没有听到清晰的安排，请重新说一次。');
}

function voiceRecordingMimeType() {
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
}

function releaseVoiceAudioResources() {
  clearTimeout(voiceAssistant.audioStopTimer);
  voiceAssistant.audioStopTimer = null;
  if (voiceAssistant.audioStream) voiceAssistant.audioStream.getTracks().forEach((track) => track.stop());
  voiceAssistant.audioStream = null;
  voiceAssistant.audioRecorder = null;
  voiceAssistant.audioChunks = [];
}

function cancelVoiceAudioCapture() {
  const recorder = voiceAssistant.audioRecorder;
  if (recorder) {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    if (recorder.state === 'recording') try { recorder.stop(); } catch {}
  }
  releaseVoiceAudioResources();
}

async function submitVoiceRecording(audio, requestId) {
  voiceAssistant.listening = false;
  voiceAssistant.stopRequested = false;
  stopVoiceTimer();
  if (!audio?.size) { finishVoiceListeningError('没有录到清晰的声音，请重新说一次。'); return; }
  if (audio.size > 8 * 1024 * 1024) { finishVoiceListeningError('这段语音太长了，请控制在 90 秒内重新说一次。'); return; }
  voiceAssistant.processing = true;
  voiceAssistant.captureMode = 'audio-transcribing';
  setVoiceMessage('');
  renderVoiceAssistant();
  try {
    const transcript = await voiceAudioApi(audio, requestId);
    if (!transcript) throw new Error('没有识别出清晰内容，请重新说一次。');
    beginVoiceTranscriptReview(transcript);
  } catch (error) {
    voiceAssistant.processing = false;
    voiceAssistant.captureMode = '';
    finishVoiceListeningError(error.message || '暂时无法把语音转成文字，请稍后再试。');
  }
}

function voiceBlobFromBase64(value, type) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: type || 'audio/mp4' });
}

async function startVoiceAudioFallback(fallbackToDeviceRecognition = false) {
  if (!voiceAssistant.listening || voiceAssistant.stopRequested) return;
  if (!voiceAssistant.configured.transcription) { finishVoiceListeningError('当前手机需要兼容录音模式，但语音转文字服务尚未启用。'); return; }
  if (!voiceCanRecordAudio()) { finishVoiceListeningError('当前手机无法启动兼容录音，请更新 Android System WebView 后重试。'); return; }
  voiceAssistant.captureMode = 'audio';
  setVoiceMessage('');
  renderVoiceAssistant();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    if (!voiceAssistant.listening || voiceAssistant.stopRequested) {
      stream.getTracks().forEach((track) => track.stop());
      finishVoiceListeningError('录音尚未开始，请重新点一下麦克风。');
      return;
    }
    const type = voiceRecordingMimeType();
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    voiceAssistant.audioStream = stream;
    voiceAssistant.audioRecorder = recorder;
    voiceAssistant.audioChunks = [];
    recorder.ondataavailable = (event) => { if (event.data?.size) voiceAssistant.audioChunks.push(event.data); };
    recorder.onerror = () => finishVoiceListeningError('兼容录音没有成功，请重新说一次。');
    recorder.onstop = () => {
      const chunks = [...voiceAssistant.audioChunks], recordedType = recorder.mimeType || type || 'audio/webm';
      releaseVoiceAudioResources();
      void submitVoiceRecording(new Blob(chunks, { type: recordedType }), voiceAssistant.requestId);
    };
    recorder.start();
    voiceAssistant.startedAt = Date.now();
    voiceAssistant.audioStopTimer = setTimeout(() => {
      if (voiceAssistant.listening && voiceAssistant.captureMode === 'audio') stopVoiceListening();
    }, 90_000);
    renderVoiceAssistant();
  } catch (error) {
    if (fallbackToDeviceRecognition && error?.name !== 'NotAllowedError') {
      const bridge = voiceNativeBridge();
      if (bridge) {
        voiceAssistant.captureMode = 'native';
        bridge.post({ action: 'start-live', requestId: voiceAssistant.requestId, locale: voiceLocale() });
        renderVoiceAssistant();
        return;
      }
      if (voiceWebRecognitionClass()) {
        voiceAssistant.captureMode = 'web';
        try { startWebVoiceRecognition(); return; } catch {}
      }
    }
    finishVoiceListeningError(error?.name === 'NotAllowedError' ? '没有获得麦克风权限，请在手机设置中允许“每日备忘”使用麦克风。' : '无法启动兼容录音，请稍后再试。');
  }
}

function startWebVoiceRecognition() {
  const Recognition = voiceWebRecognitionClass();
  if (!Recognition) throw new Error('unsupported');
  const prefix = voiceAssistant.committedTranscript.trim();
  const recognition = new Recognition();
  recognition.lang = voiceLocale();
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    let finalSession = '', interimSession = '';
    for (let index = 0; index < event.results.length; index += 1) {
      const part = event.results[index][0]?.transcript || '';
      if (event.results[index].isFinal) finalSession = joinVoiceParts(finalSession, part);
      else interimSession = joinVoiceParts(interimSession, part);
    }
    const currentSession = joinVoiceParts(finalSession, interimSession);
    voiceAssistant.committedTranscript = joinVoiceParts(prefix, finalSession);
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
  if (voiceQuotaExhausted()) { setVoiceMessage('今天的 10 次额度已经用完，明天会自动恢复。'); return; }
  voiceAssistant.listening = true;
  voiceAssistant.reviewing = false;
  voiceAssistant.recognitionEnded = false;
  voiceAssistant.stopRequested = false;
  voiceAssistant.transcript = '';
  voiceAssistant.committedTranscript = '';
  voiceAssistant.captureMode = '';
  voiceAssistant.requestId = crypto.randomUUID();
  voiceAssistant.startedAt = Date.now();
  $('voice-transcript-editor').value = '';
  setVoiceMessage('');
  startVoiceTimer();
  renderVoiceAssistant();
  if (voiceAssistant.configured.transcription && voiceCanRecordAudio()) {
    void startVoiceAudioFallback(true);
    return;
  }
  const bridge = voiceNativeBridge();
  if (bridge) {
    voiceAssistant.captureMode = 'native';
    bridge.post({ action: 'start-live', requestId: voiceAssistant.requestId, locale: voiceLocale() });
    return;
  }
  if (!voiceWebRecognitionClass()) { void startVoiceAudioFallback(); return; }
  voiceAssistant.captureMode = 'web';
  try { startWebVoiceRecognition(); }
  catch { void startVoiceAudioFallback(); }
}

function finishVoiceListeningError(message) {
  voiceAssistant.listening = false;
  voiceAssistant.recognitionEnded = false;
  voiceAssistant.stopRequested = false;
  voiceAssistant.recognition = null;
  cancelVoiceAudioCapture();
  voiceAssistant.captureMode = '';
  voiceAssistant.processing = false;
  voiceAssistant.reviewing = false;
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
  if (voiceAssistant.captureMode === 'audio') {
    if (!voiceAssistant.audioRecorder) { finishVoiceListeningError('录音尚未开始，请重新点一下麦克风。'); return; }
    try { voiceAssistant.audioRecorder.stop(); }
    catch { finishVoiceListeningError('兼容录音没有成功，请重新说一次。'); }
    return;
  }
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
  voiceAssistant.quota = normalizedVoiceQuota({ ...voiceAssistant.quota, ...result });
  const events = Array.isArray(result.events) ? result.events : [];
  const memos = Array.isArray(result.memos) ? result.memos : [];
  if (!events.length) {
    voiceAssistant.reviewing = true;
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
  voiceAssistant.reviewing = false;
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
    voiceAssistant.reviewing = true;
    setVoiceMessage('这段内容与待办、日程或关联备忘录无关，没有交给 AI，也不会消耗次数。');
    renderVoiceAssistant();
    return;
  }
  voiceAssistant.processing = true;
  setVoiceMessage('');
  renderVoiceAssistant();
  try {
    const result = await voiceApi('', { method: 'POST', body: JSON.stringify({ text: transcript, provider: voiceAssistant.provider, timezone: voiceTimezone(), locale: voiceLocale(), requestId }) });
    await applyVoiceCreationResult(result);
  } catch (error) {
    try {
      const recovered = await waitForVoiceCreation(requestId);
      await applyVoiceCreationResult(recovered);
    } catch {
      voiceAssistant.reviewing = true;
      if (error.payload && Number.isFinite(Number(error.payload.remaining))) voiceAssistant.quota.remaining = Number(error.payload.remaining);
      setVoiceMessage(error.message || '这次安排没有创建成功，请稍后再试。');
    }
  } finally {
    voiceAssistant.processing = false;
    renderVoiceAssistant();
  }
}

function confirmVoiceTranscript() {
  if (voiceAssistant.processing || !voiceAssistant.reviewing) return;
  const transcript = String($('voice-transcript-editor').value || '').trim();
  if (!transcript) {
    setVoiceMessage('请先保留或补充要创建的内容。');
    $('voice-transcript-editor').focus();
    return;
  }
  voiceAssistant.transcript = transcript;
  void submitVoiceTranscript(transcript, crypto.randomUUID());
}

function retryVoiceTranscript() {
  if (voiceAssistant.processing) return;
  voiceAssistant.reviewing = false;
  voiceAssistant.transcript = '';
  $('voice-transcript-editor').value = '';
  setVoiceMessage('');
  startVoiceListening();
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
  if (detail.status === 'audio-listening') {
    voiceAssistant.captureMode = 'native-audio';
    setVoiceMessage('');
    renderVoiceAssistant();
    return;
  }
  if (detail.status === 'audio-success') {
    voiceAssistant.listening = false;
    stopVoiceTimer();
    try { void submitVoiceRecording(voiceBlobFromBase64(detail.audioBase64, detail.mimeType), voiceAssistant.requestId); }
    catch { finishVoiceListeningError('没有收到完整录音，请重新说一次。'); }
    return;
  }
  if (detail.status === 'audio-failed') {
    finishVoiceListeningError(detail.message || '兼容录音没有成功，请重新说一次。');
    return;
  }
  if (voiceNeedsAudioFallback(detail)) { void startVoiceAudioFallback(); return; }
  if (detail.status === 'listening' || detail.status === 'partial') return;
  if (detail.status === 'ready') { voiceAssistant.recognitionEnded = true; renderVoiceAssistant(); return; }
  if (detail.status === 'success') {
    voiceAssistant.listening = false;
    stopVoiceTimer();
    if (String(detail.text || voiceAssistant.transcript).trim()) beginVoiceTranscriptReview(detail.text || voiceAssistant.transcript);
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
$('confirm-voice-transcript').onclick = confirmVoiceTranscript;
$('retry-voice-transcript').onclick = retryVoiceTranscript;
$('voice-transcript-editor').addEventListener('input', () => { voiceAssistant.transcript = $('voice-transcript-editor').value; setVoiceMessage(''); });
$('undo-voice-result').onclick = () => void undoVoiceResult();
$('view-voice-result').onclick = openVoiceResultInCalendar;
document.addEventListener('click', (event) => { if (event.target.closest('[data-screen="voice-assistant-screen"]')) setTimeout(() => void refreshVoiceQuota(), 0); });
if (supabaseClient) supabaseClient.auth.onAuthStateChange(() => setTimeout(() => void refreshVoiceQuota(), 80));
renderVoiceAssistant();
setTimeout(() => void refreshVoiceQuota(), 120);
