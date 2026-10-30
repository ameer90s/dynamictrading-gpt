export function newYorkParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    weekday: parts.weekday,
    hour, minute,
    minuteOfDay: hour * 60 + minute,
  };
}

const HOLIDAY_NAMES_AR = {
  NEW_YEAR: "رأس السنة",
  MLK: "عطلة مارتن لوثر كينغ",
  PRESIDENTS: "يوم الرؤساء",
  GOOD_FRIDAY: "الجمعة العظيمة",
  MEMORIAL: "يوم الذكرى",
  JUNETEENTH: "جونتينث",
  INDEPENDENCE: "عيد الاستقلال",
  LABOR: "عيد العمال",
  THANKSGIVING: "عيد الشكر",
  CHRISTMAS: "عيد الميلاد",
};

const EXACT_EARLY_CLOSES = new Set([
  "2026-11-27", "2026-12-24",
  "2027-11-26",
  "2028-07-03", "2028-11-24",
]);

export function nyseHoliday(dateKey) {
  const m = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const holidays = holidayMap(year);
  const code = holidays.get(dateKey);
  return code ? { code, nameAr: HOLIDAY_NAMES_AR[code] || code } : null;
}

export function isNyseTradingDay(input = new Date()) {
  const p = typeof input === "string" ? partsFromDateKey(input) : newYorkParts(input);
  if (!p || [0, 6].includes(dayOfWeek(p.dateKey))) return false;
  return !nyseHoliday(p.dateKey);
}

export function marketSession(date = new Date()) {
  const p = newYorkParts(date);
  const holiday = nyseHoliday(p.dateKey);
  const weekend = ["Sat", "Sun"].includes(p.weekday);
  const isTradingDay = !weekend && !holiday;
  const earlyClose = isTradingDay && isEarlyClose(p.dateKey);
  const regularOpen = 9 * 60 + 30;
  const regularClose = earlyClose ? 13 * 60 : 16 * 60;
  const preOpen = 4 * 60;
  const postClose = earlyClose ? 17 * 60 : 20 * 60;
  let session = "CLOSED";
  if (!isTradingDay) session = holiday ? "CLOSED_HOLIDAY" : "CLOSED_WEEKEND";
  else if (p.minuteOfDay >= preOpen && p.minuteOfDay < regularOpen) session = "PREMARKET";
  else if (p.minuteOfDay >= regularOpen && p.minuteOfDay < regularClose) session = "REGULAR";
  else if (p.minuteOfDay >= regularClose && p.minuteOfDay < postClose) session = "POSTMARKET";
  return {
    ...p,
    session,
    isTradingDay,
    isWeekday: !weekend,
    isOpen: session === "REGULAR",
    isExtended: session === "PREMARKET" || session === "POSTMARKET",
    holiday: holiday?.code || null,
    holidayNameAr: holiday?.nameAr || null,
    earlyClose,
    preOpenMinute: preOpen,
    regularOpenMinute: regularOpen,
    regularCloseMinute: regularClose,
    postCloseMinute: postClose,
  };
}

export function recommendationWindow(date = new Date()) {
  const s = marketSession(date);
  const start = 9 * 60 + 30;
  const end = Math.max(start, Number(s.regularCloseMinute || 16 * 60) - 1);
  const canGenerate = s.isTradingDay && s.minuteOfDay >= start && s.minuteOfDay <= end;
  return { ...s, canGenerate, startMinute: start, endMinute: end };
}

export function nextTradingDateKey(from = new Date()) {
  let probe = new Date(from.getTime());
  for (let i = 0; i < 14; i++) {
    probe = new Date(probe.getTime() + 24 * 60 * 60 * 1000);
    const p = newYorkParts(probe);
    if (isNyseTradingDay(p.dateKey)) return p.dateKey;
  }
  return newYorkParts(probe).dateKey;
}

export function previousTradingDateKey(from = new Date()) {
  let probe = new Date(from.getTime());
  for (let i = 0; i < 14; i++) {
    probe = new Date(probe.getTime() - 24 * 60 * 60 * 1000);
    const p = newYorkParts(probe);
    if (isNyseTradingDay(p.dateKey)) return p.dateKey;
  }
  return newYorkParts(probe).dateKey;
}

export function nextMarketOpenLabel(from = new Date()) {
  const s = marketSession(from);
  if (s.isTradingDay && s.minuteOfDay < s.preOpenMinute) return { dateKey:s.dateKey, session:"PREMARKET", time:"04:00" };
  if (s.isTradingDay && s.minuteOfDay < s.regularOpenMinute) return { dateKey:s.dateKey, session:"REGULAR", time:"09:30" };
  const next = nextTradingDateKey(from);
  return { dateKey:next, session:"PREMARKET", time:"04:00" };
}

function holidayMap(year) {
  const out = new Map();
  add(out, newYearObserved(year), "NEW_YEAR");
  add(out, nthWeekday(year, 1, 1, 3), "MLK");
  add(out, nthWeekday(year, 2, 1, 3), "PRESIDENTS");
  add(out, addDays(easterSunday(year), -2), "GOOD_FRIDAY");
  add(out, lastWeekday(year, 5, 1), "MEMORIAL");
  add(out, observedFixed(year, 6, 19), "JUNETEENTH");
  add(out, observedFixed(year, 7, 4), "INDEPENDENCE");
  add(out, nthWeekday(year, 9, 1, 1), "LABOR");
  add(out, nthWeekday(year, 11, 4, 4), "THANKSGIVING");
  add(out, observedFixed(year, 12, 25), "CHRISTMAS");
  return out;
}

function add(map, key, value) { if (key) map.set(key, value); }

function newYearObserved(year) {
  const key = ymd(year, 1, 1);
  const dow = dayOfWeek(key);
  if (dow === 6) return null; // NYSE does not observe a Saturday Jan 1 on the preceding Friday.
  if (dow === 0) return ymd(year, 1, 2);
  return key;
}

function observedFixed(year, month, day) {
  const key = ymd(year, month, day);
  const dow = dayOfWeek(key);
  if (dow === 6) return addDays(key, -1);
  if (dow === 0) return addDays(key, 1);
  return key;
}

function nthWeekday(year, month, weekday, n) {
  let d = ymd(year, month, 1);
  const delta = (weekday - dayOfWeek(d) + 7) % 7;
  return addDays(d, delta + (n - 1) * 7);
}

function lastWeekday(year, month, weekday) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let d = ymd(year, month, lastDay);
  const delta = (dayOfWeek(d) - weekday + 7) % 7;
  return addDays(d, -delta);
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31);
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return ymd(year, month, day);
}

function isEarlyClose(dateKey) {
  if (EXACT_EARLY_CLOSES.has(dateKey)) return true;
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return false;
  const year = Number(m[1]);
  if (year >= 2026 && year <= 2028) return false; // exact NYSE schedule for these years above.
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  if (dateKey === addDays(thanksgiving, 1) && isNyseTradingDay(dateKey)) return true;
  if (dateKey === ymd(year, 12, 24) && isNyseTradingDay(dateKey)) return true;
  if (dateKey === ymd(year, 7, 3) && isNyseTradingDay(dateKey)) return true;
  return false;
}

function partsFromDateKey(key) {
  const m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return null;
  return { dateKey:key, year:Number(m[1]), month:Number(m[2]), day:Number(m[3]) };
}
function dayOfWeek(key) { const [y,m,d] = key.split("-").map(Number); return new Date(Date.UTC(y,m-1,d)).getUTCDay(); }
function addDays(key, n) { const [y,m,d]=key.split("-").map(Number); const dt=new Date(Date.UTC(y,m-1,d+n)); return ymd(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate()); }
function ymd(y,m,d) { return `${String(y).padStart(4,"0")}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
