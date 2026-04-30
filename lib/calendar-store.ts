import type { KaiExecutionBlock, KaiExecutionPlan } from "@/lib/kai-prompt";
import type { BrowserSupabaseClient } from "@/lib/supabase";

export type CalendarEvent = {
  id: string;
  eventKey: string;
  title: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  kind: KaiExecutionBlock["kind"];
  color: string;
  status: "scheduled" | "completed" | "skipped";
  sourcePlanKey: string | null;
  sourceBlockId: string | null;
  externalProvider: "local" | "google";
  externalEventId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type CalendarEventRow = {
  id: string;
  event_key: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  kind: KaiExecutionBlock["kind"];
  color: string | null;
  status: "scheduled" | "completed" | "skipped";
  source_plan_key: string | null;
  source_block_id: string | null;
  external_provider: "local" | "google" | null;
  external_event_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const LOCAL_CALENDAR_KEY = "verge-calendar-events";
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function calendarEventsTable(supabase: BrowserSupabaseClient) {
  return supabase.from("calendar_events" as never);
}

function getLocalStorageKey(userId: string | null) {
  return `${LOCAL_CALENDAR_KEY}:${userId || "guest"}`;
}

function getKindColor(kind: KaiExecutionBlock["kind"]) {
  switch (kind) {
    case "task":
      return "#fb923c";
    case "fixed":
      return "#c084fc";
    case "workout":
      return "#f87171";
    case "break":
    case "recovery":
      return "#34d399";
    case "buffer":
    case "commute":
      return "#60a5fa";
    case "meal":
      return "#fbbf24";
    default:
      return "#a1a1aa";
  }
}

function normalizeCalendarEvent(raw: Partial<CalendarEvent> | null | undefined): CalendarEvent | null {
  if (!raw?.eventDate || !raw?.title || !raw?.eventKey) {
    return null;
  }

  return {
    id: raw.id || crypto.randomUUID(),
    eventKey: raw.eventKey,
    title: raw.title,
    eventDate: raw.eventDate,
    startTime: raw.startTime || null,
    endTime: raw.endTime || null,
    kind: raw.kind || "task",
    color: raw.color || getKindColor(raw.kind || "task"),
    status: raw.status === "completed" || raw.status === "skipped" ? raw.status : "scheduled",
    sourcePlanKey: raw.sourcePlanKey || null,
    sourceBlockId: raw.sourceBlockId || null,
    externalProvider: raw.externalProvider === "google" ? "google" : "local",
    externalEventId: raw.externalEventId || null,
    notes: raw.notes || null,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function normalizeCalendarEventRow(row: CalendarEventRow | null): CalendarEvent | null {
  if (!row) {
    return null;
  }

  return normalizeCalendarEvent({
    id: row.id,
    eventKey: row.event_key,
    title: row.title,
    eventDate: row.event_date,
    startTime: row.start_time,
    endTime: row.end_time,
    kind: row.kind,
    color: row.color || getKindColor(row.kind),
    status: row.status,
    sourcePlanKey: row.source_plan_key,
    sourceBlockId: row.source_block_id,
    externalProvider: row.external_provider === "google" ? "google" : "local",
    externalEventId: row.external_event_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function readLocalCalendarEvents(userId: string | null) {
  if (typeof window === "undefined") {
    return [] as CalendarEvent[];
  }

  try {
    const raw = window.localStorage.getItem(getLocalStorageKey(userId));
    if (!raw) {
      return [];
    }

    return JSON.parse(raw)
      .map((entry: Partial<CalendarEvent>) => normalizeCalendarEvent(entry))
      .filter(Boolean) as CalendarEvent[];
  } catch {
    return [];
  }
}

function writeLocalCalendarEvents(userId: string | null, events: CalendarEvent[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getLocalStorageKey(userId), JSON.stringify(events));
  } catch {}
}

function resolveDateLabelToISO(label: string | null | undefined, scopeLabel?: string | null) {
  const source = (label || scopeLabel || "Today").trim();
  const lower = source.toLowerCase();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) {
    return source;
  }

  const literalDate = Date.parse(source);
  if (!Number.isNaN(literalDate)) {
    const resolved = new Date(literalDate);
    return resolved.toISOString().slice(0, 10);
  }

  if (lower.includes("tomorrow")) {
    const next = new Date(today);
    next.setDate(next.getDate() + 1);
    return next.toISOString().slice(0, 10);
  }

  if (lower.includes("today") || lower.includes("tonight") || lower.includes("this afternoon") || lower.includes("this evening")) {
    return today.toISOString().slice(0, 10);
  }

  const weekdayMatch = Object.entries(WEEKDAY_INDEX).find(([day]) => lower.includes(day));
  if (weekdayMatch) {
    const [, weekdayIndex] = weekdayMatch;
    const currentWeekday = today.getDay();
    const dayOffset = (weekdayIndex - currentWeekday + 7) % 7;
    const next = new Date(today);
    next.setDate(next.getDate() + dayOffset);
    return next.toISOString().slice(0, 10);
  }

  return today.toISOString().slice(0, 10);
}

export function buildCalendarIntentContext(userText: string) {
  const lower = userText.toLowerCase();
  if (!/\b(calendar|put .*calendar|add .*calendar|over these days|over multiple days|multi-day|multiday)\b/.test(lower)) {
    return null;
  }

  return [
    "The user is asking for a calendar-oriented plan.",
    "If the plan spans multiple days, stop looping on follow-up questions once you have enough signal to draft it and give a clear day-by-day schedule.",
    "Include explicit day labels and times so the app can import the plan into Calendar cleanly.",
    "For calendar planning, include all relevant blocks, not only desk-work.",
    "Calendar-worthy blocks can include school, workouts, sports, meals, travel, social anchors, deadlines, and study sessions.",
  ].join("\n");
}

export function buildCalendarEventsFromPlan(plan: KaiExecutionPlan) {
  const nowIso = new Date().toISOString();

  return (plan.blocks || []).map((block, index) => {
    const eventDate = resolveDateLabelToISO(block.date_label, plan.scope_label);
    return {
      id: crypto.randomUUID(),
      eventKey: `${plan.plan_id}:${block.id || `block_${index + 1}`}`,
      title: block.title,
      eventDate,
      startTime: block.start_time || null,
      endTime: block.end_time || null,
      kind: block.kind,
      color: getKindColor(block.kind),
      status: block.status === "completed" || block.status === "skipped" ? block.status : "scheduled",
      sourcePlanKey: plan.plan_id,
      sourceBlockId: block.id || `block_${index + 1}`,
      externalProvider: "local" as const,
      externalEventId: null,
      notes: block.notes || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    } satisfies CalendarEvent;
  });
}

export async function loadCalendarEvents({
  supabase,
  userId,
}: {
  supabase: BrowserSupabaseClient | null;
  userId: string | null;
}) {
  const localEvents = readLocalCalendarEvents(userId);

  if (!supabase || !userId) {
    return localEvents;
  }

  try {
    const { data, error } = await calendarEventsTable(supabase)
      .select(
        "id, event_key, title, event_date, start_time, end_time, kind, color, status, source_plan_key, source_block_id, external_provider, external_event_id, notes, created_at, updated_at",
      )
      .eq("user_id", userId)
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      return localEvents;
    }

    const normalized = ((data as CalendarEventRow[] | null) || [])
      .map((row) => normalizeCalendarEventRow(row))
      .filter(Boolean) as CalendarEvent[];
    writeLocalCalendarEvents(userId, normalized);
    return normalized;
  } catch {
    return localEvents;
  }
}

export async function importPlanToCalendar({
  supabase,
  userId,
  plan,
}: {
  supabase: BrowserSupabaseClient | null;
  userId: string | null;
  plan: KaiExecutionPlan | null;
}) {
  if (!plan) {
    return [];
  }

  const events = buildCalendarEventsFromPlan(plan);
  const existingLocalEvents = readLocalCalendarEvents(userId);
  const mergedLocalEvents = [
    ...existingLocalEvents.filter((event) => !events.some((incomingEvent) => incomingEvent.eventKey === event.eventKey)),
    ...events,
  ].sort((left, right) =>
    `${left.eventDate}:${left.startTime || "99:99"}:${left.title}`.localeCompare(
      `${right.eventDate}:${right.startTime || "99:99"}:${right.title}`,
    ),
  );
  writeLocalCalendarEvents(userId, mergedLocalEvents);

  if (!supabase || !userId) {
    return mergedLocalEvents;
  }

  try {
    await calendarEventsTable(supabase).upsert(
      events.map((event) => ({
        user_id: userId,
        event_key: event.eventKey,
        title: event.title,
        event_date: event.eventDate,
        start_time: event.startTime,
        end_time: event.endTime,
        kind: event.kind,
        color: event.color,
        status: event.status,
        source_plan_key: event.sourcePlanKey,
        source_block_id: event.sourceBlockId,
        external_provider: event.externalProvider,
        external_event_id: event.externalEventId,
        notes: event.notes,
        updated_at: new Date().toISOString(),
      })) as never,
      { onConflict: "user_id,event_key" },
    );
  } catch {
    // Local calendar already has the import.
  }

  return mergedLocalEvents;
}

export async function deleteCalendarEvent({
  supabase,
  userId,
  eventId,
}: {
  supabase: BrowserSupabaseClient | null;
  userId: string | null;
  eventId: string;
}) {
  if (!supabase || !userId) {
    const nextEvents = readLocalCalendarEvents(userId).filter((event) => event.id !== eventId);
    writeLocalCalendarEvents(userId, nextEvents);
    return;
  }

  try {
    await calendarEventsTable(supabase).delete().eq("id", eventId).eq("user_id", userId);
  } finally {
    const nextEvents = readLocalCalendarEvents(userId).filter((event) => event.id !== eventId);
    writeLocalCalendarEvents(userId, nextEvents);
  }
}

function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, occurrence: number) {
  const date = new Date(year, monthIndex, 1);
  const offset = (weekday - date.getDay() + 7) % 7;
  date.setDate(1 + offset + (occurrence - 1) * 7);
  return date;
}

function lastWeekdayOfMonth(year: number, monthIndex: number, weekday: number) {
  const date = new Date(year, monthIndex + 1, 0);
  const offset = (date.getDay() - weekday + 7) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}

export function getUSHolidaysForYear(year: number) {
  const holidays = new Map<string, string>();
  const setHoliday = (date: Date, label: string) => holidays.set(date.toISOString().slice(0, 10), label);

  setHoliday(new Date(year, 0, 1), "New Year's Day");
  setHoliday(nthWeekdayOfMonth(year, 0, 1, 3), "Martin Luther King Jr. Day");
  setHoliday(nthWeekdayOfMonth(year, 1, 1, 3), "Presidents Day");
  setHoliday(lastWeekdayOfMonth(year, 4, 1), "Memorial Day");
  setHoliday(new Date(year, 5, 19), "Juneteenth");
  setHoliday(new Date(year, 6, 4), "Independence Day");
  setHoliday(nthWeekdayOfMonth(year, 8, 1, 1), "Labor Day");
  setHoliday(nthWeekdayOfMonth(year, 9, 1, 2), "Indigenous Peoples' Day");
  setHoliday(new Date(year, 10, 11), "Veterans Day");
  setHoliday(nthWeekdayOfMonth(year, 10, 4, 4), "Thanksgiving");
  setHoliday(new Date(year, 11, 25), "Christmas Day");

  return holidays;
}
