(function setupMemoTimeSuggestions() {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const chinesePeriods = '凌晨|清晨|早上|早晨|上午|中午|下午|傍晚|晚上|今晚|明早|明晚';
  const chineseWeekdays = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
  const englishWeekdays = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const englishMonths = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
    dec: 12, december: 12,
  };

  function pad(value) { return String(value).padStart(2, '0'); }
  function dateKey(value) { return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`; }
  function addDays(value, amount) { const next = new Date(value); next.setDate(next.getDate() + amount); return next; }
  function validDate(year, month, day) { const value = new Date(year, month - 1, day); return value.getFullYear() === year && value.getMonth() === month - 1 && value.getDate() === day ? value : null; }
  function atTime(date, time) { const [hours, minutes] = time.split(':').map(Number), value = new Date(date); value.setHours(hours, minutes, 0, 0); return value; }

  function normalizeHour(hour, period = '') {
    let value = Number(hour);
    const normalized = String(period || '').toLowerCase().replace(/\./g, '');
    if (!Number.isInteger(value) || value < 0 || value > 23) return null;
    if (['下午', '傍晚', '晚上', '今晚', '明晚', 'pm'].includes(normalized) && value < 12) value += 12;
    if (['凌晨', '清晨', '早上', '早晨', '上午', '明早', 'am'].includes(normalized) && value === 12) value = 0;
    if (normalized === '中午' && value < 11) value += 12;
    return value > 23 ? null : value;
  }

  function timeCandidate(match, offset, kind) {
    let period = '', hours = 0, minutes = 0;
    if (kind === 'colon') {
      period = match[1] || match[4] || '';
      hours = Number(match[2]);
      minutes = Number(match[3]);
    } else if (kind === 'chinese') {
      period = match[1] || '';
      hours = Number(match[2]);
      minutes = match[3] === '半' ? 30 : Number(match[4] || 0);
    } else {
      period = match[3] || '';
      hours = Number(match[1]);
      minutes = Number(match[2] || 0);
    }
    const normalizedHours = normalizeHour(hours, period);
    if (normalizedHours === null || minutes < 0 || minutes > 59) return null;
    return {
      index: offset + match.index,
      end: offset + match.index + match[0].length,
      raw: match[0],
      time: `${pad(normalizedHours)}:${pad(minutes)}`,
      rawHour: hours,
      period,
    };
  }

  function findTime(text, startAt = 0) {
    const source = String(text).slice(startAt), candidates = [];
    const colon = source.match(new RegExp(`(${chinesePeriods})?\\s*(\\d{1,2})[:：]([0-5]\\d)\\s*(a\\.?m\\.?|p\\.?m\\.?)?`, 'i'));
    const chinese = source.match(new RegExp(`(${chinesePeriods})?\\s*(\\d{1,2})\\s*(?:点|时)(?:\\s*(半|(\\d{1,2})\\s*分?))?`));
    const english = source.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
    if (colon) candidates.push(timeCandidate(colon, startAt, 'colon'));
    if (chinese) candidates.push(timeCandidate(chinese, startAt, 'chinese'));
    if (english) candidates.push(timeCandidate(english, startAt, 'english'));
    return candidates.filter(Boolean).sort((left, right) => left.index - right.index || right.raw.length - left.raw.length)[0] || null;
  }

  function resolveWeekday(now, targetDay, qualifier, time) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()), daysFromMonday = (day.getDay() + 6) % 7;
    let target = addDays(day, -daysFromMonday + (targetDay === 0 ? 6 : targetDay - 1));
    const lower = String(qualifier || '').toLowerCase(), nextWeek = lower.startsWith('下') || lower.startsWith('next');
    const fixedThisWeek = lower.startsWith('本') || lower.startsWith('这');
    if (nextWeek) target = addDays(target, 7);
    const scheduled = atTime(target, time);
    if (!nextWeek && !fixedThisWeek && scheduled <= now) target = addDays(target, 7);
    if (fixedThisWeek && scheduled <= now) return null;
    return target;
  }

  function resolveDate(text, timeToken, now) {
    const textValue = String(text), currentYear = now.getFullYear();
    let match = textValue.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
    if (match) {
      const value = validDate(Number(match[1]), Number(match[2]), Number(match[3]));
      return value && atTime(value, timeToken.time) > now ? { value, raw: match[0] } : null;
    }
    match = textValue.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (match) {
      const value = validDate(Number(match[1]), Number(match[2]), Number(match[3]));
      return value && atTime(value, timeToken.time) > now ? { value, raw: match[0] } : null;
    }
    match = textValue.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
    if (match) {
      let value = validDate(currentYear, Number(match[1]), Number(match[2]));
      if (!value) return null;
      if (atTime(value, timeToken.time) <= now) value = validDate(currentYear + 1, Number(match[1]), Number(match[2]));
      return value ? { value, raw: match[0] } : null;
    }
    match = textValue.match(/(?:^|[\s，,；;])(\d{1,2})[/.](\d{1,2})(?=$|[\s，,；;])/);
    if (match) {
      let value = validDate(currentYear, Number(match[1]), Number(match[2]));
      if (!value) return null;
      if (atTime(value, timeToken.time) <= now) value = validDate(currentYear + 1, Number(match[1]), Number(match[2]));
      return value ? { value, raw: match[0].trim() } : null;
    }
    match = textValue.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i);
    if (match) {
      const month = englishMonths[match[1].toLowerCase()], suppliedYear = Number(match[3] || currentYear);
      let value = validDate(suppliedYear, month, Number(match[2]));
      if (!value) return null;
      if (!match[3] && atTime(value, timeToken.time) <= now) value = validDate(currentYear + 1, month, Number(match[2]));
      return value && atTime(value, timeToken.time) > now ? { value, raw: match[0] } : null;
    }
    match = textValue.match(/大后天|后天|明天|今天/);
    if (match) {
      const offset = match[0] === '今天' ? 0 : match[0] === '明天' ? 1 : match[0] === '后天' ? 2 : 3;
      const value = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), offset);
      return atTime(value, timeToken.time) > now ? { value, raw: match[0] } : null;
    }
    match = textValue.match(/\b(day after tomorrow|tomorrow|today)\b/i);
    if (match) {
      const word = match[1].toLowerCase(), offset = word === 'today' ? 0 : word === 'tomorrow' ? 1 : 2;
      const value = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), offset);
      return atTime(value, timeToken.time) > now ? { value, raw: match[0] } : null;
    }
    match = textValue.match(/((?:下|本|这)?(?:周|星期|礼拜))\s*([一二三四五六日天])/);
    if (match) {
      const value = resolveWeekday(now, chineseWeekdays[match[2]], match[1], timeToken.time);
      return value ? { value, raw: match[0] } : null;
    }
    match = textValue.match(/\b(next\s+)?(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i);
    if (match) {
      const value = resolveWeekday(now, englishWeekdays[match[2].toLowerCase()], match[1] ? 'next' : '', timeToken.time);
      return value ? { value, raw: match[0] } : null;
    }
    if (['明早', '明晚'].includes(timeToken.period)) {
      return { value: addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1), raw: '' };
    }
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { value: atTime(today, timeToken.time) > now ? today : addDays(today, 1), raw: '' };
  }

  function cleanTitle(line, dateRaw, firstTime, secondTime, fallbackTitle) {
    let title = String(line);
    [dateRaw, firstTime?.raw, secondTime?.raw].filter(Boolean).forEach((token) => { title = title.replace(token, ' '); });
    title = title
      .replace(/\s*(?:-|–|—|~|～|至|到)\s*/g, ' ')
      .replace(/^[\s•·●◦▪▫☐□✓✔✅*\-—]+/, '')
      .replace(/^\d{1,2}[.)、]\s*/, '')
      .replace(/^(?:提醒我|提醒|记得|安排|计划)\s*/i, '')
      .replace(/^(?:at|on)\s+|\s+(?:at|on)$/gi, '')
      .replace(/^[\s:：,，。;；\-—]+|[\s:：,，。;；\-—]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return String(title || fallbackTitle || '备忘录任务').slice(0, 60);
  }

  function detectLine(line, options) {
    const firstTime = findTime(line);
    if (!firstTime) return null;
    let secondTime = findTime(line, firstTime.end), endTime = '', connector = '';
    if (secondTime) {
      connector = line.slice(firstTime.end, secondTime.index);
      if (!/^\s*(?:-|–|—|~|～|至|到)\s*$/.test(connector)) secondTime = null;
    }
    if (secondTime) {
      if (!secondTime.period && firstTime.period) {
        const inheritedHour = normalizeHour(secondTime.rawHour, firstTime.period);
        if (inheritedHour !== null) secondTime.time = `${pad(inheritedHour)}:${secondTime.time.slice(3)}`;
      }
      if (secondTime.time > firstTime.time) endTime = secondTime.time;
      else secondTime = null;
    }
    const resolvedDate = resolveDate(line, firstTime, options.now);
    if (!resolvedDate) return null;
    const title = cleanTitle(line, resolvedDate.raw, firstTime, secondTime, options.fallbackTitle);
    const date = dateKey(resolvedDate.value), key = `${date}|${firstTime.time}|${endTime}|${title.toLocaleLowerCase()}`;
    return { key, title, date, time: firstTime.time, endTime, mode: endTime ? 'range' : 'reminder', source: line.trim() };
  }

  function detect(text, options = {}) {
    const now = options.now instanceof Date ? new Date(options.now) : new Date(), fallbackTitle = String(options.fallbackTitle || '').trim();
    const segments = String(text || '').replace(/\r/g, '\n').split(/\n+|[；;。]+/).map((item) => item.trim()).filter(Boolean);
    const results = [], keys = new Set();
    for (const segment of segments) {
      const suggestion = detectLine(segment, { now, fallbackTitle });
      if (!suggestion || keys.has(suggestion.key)) continue;
      keys.add(suggestion.key);
      results.push(suggestion);
      if (results.length >= 8) break;
    }
    return results;
  }

  root.MemoryEveryDayTimeSuggestions = { detect };
}());
