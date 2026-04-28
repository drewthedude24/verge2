import type { KaiExecutionBlock, KaiExecutionPlan } from "@/lib/kai-prompt";

const OFFLINE_TITLE_PATTERN =
  /\b(school|class|lecture|campus|commute|drive|travel|bus|train|walk|dinner|lunch|breakfast|meal|golf|gym|workout|practice|shower|sleep|nap|errand|chores?|hangout|social|family time)\b/i;
const COMPUTER_TASK_PATTERN =
  /\b(study|studying|homework|assignment|problem set|worksheet|read|reading|write|writing|draft|outline|essay|paper|research|project|slides|deck|code|coding|debug|build|review|revise|notes|meeting|zoom|call|email|prep|exam prep|quiz prep|calc|calculus|physics|chem|lab report)\b/i;
const VIDEO_MEETING_PATTERN = /\b(meeting|zoom|call|teams|standup|interview|office hours)\b/i;
const TODAYISH_PATTERN = /\b(today|tonight|this afternoon|this evening)\b/i;

export function normalizeExecutionSurface(block: KaiExecutionBlock): "in_app" | "offline" | "none" {
  if (block.execution_surface === "in_app" || block.execution_surface === "offline" || block.execution_surface === "none") {
    return block.execution_surface;
  }

  if (block.kind === "break" || block.kind === "buffer" || block.kind === "meal" || block.kind === "recovery" || block.kind === "commute") {
    return "none";
  }

  if (block.kind === "workout") {
    return "offline";
  }

  if (VIDEO_MEETING_PATTERN.test(block.title) || VIDEO_MEETING_PATTERN.test(block.source_goal || "")) {
    return "in_app";
  }

  if (OFFLINE_TITLE_PATTERN.test(block.title) || OFFLINE_TITLE_PATTERN.test(block.source_goal || "")) {
    return "offline";
  }

  if (COMPUTER_TASK_PATTERN.test(block.title) || COMPUTER_TASK_PATTERN.test(block.source_goal || "")) {
    return "in_app";
  }

  if (block.kind === "task") {
    return "in_app";
  }

  return "offline";
}

export function isTaskFlowEligibleBlock(block: KaiExecutionBlock) {
  return normalizeExecutionSurface(block) === "in_app";
}

export function isMultiDayPlan(plan: KaiExecutionPlan | null) {
  if (!plan) {
    return false;
  }

  if (plan.timeline_mode === "multi_day") {
    return true;
  }

  const labels = new Set((plan.blocks || []).map((block) => block.date_label?.trim()).filter(Boolean));
  return labels.size > 1;
}

export function getTaskFlowMessage(plan: KaiExecutionPlan | null) {
  if (!plan) {
    return null;
  }

  if (isMultiDayPlan(plan)) {
    return "Multi-day schedule won't have a task flow yet. Use Kai's text schedule for the day-by-day plan.";
  }

  if (!(plan.blocks || []).some(isTaskFlowEligibleBlock)) {
    return "This schedule is mostly offline or fixed life blocks, so Verge does not have an in-app task flow for it.";
  }

  return null;
}

export function parseClockToMinutes(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value || "")) {
    return null;
  }

  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

export function formatMinutesAsClock(value: number) {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function addMinutesToClock(value: string, deltaMinutes: number) {
  const parsed = parseClockToMinutes(value);
  if (parsed === null) {
    return value;
  }

  return formatMinutesAsClock(parsed + deltaMinutes);
}

export function getRoundedDelayMinutes(nowMinutes: number, scheduledMinutes: number) {
  if (nowMinutes < scheduledMinutes + 5) {
    return 0;
  }

  const roundedStart = Math.ceil(nowMinutes / 10) * 10;
  return Math.max(0, roundedStart - scheduledMinutes);
}

export function isPlanActiveToday(plan: KaiExecutionPlan | null, currentWeekdayLabel: string) {
  if (!plan) {
    return false;
  }

  if (TODAYISH_PATTERN.test(plan.scope_label || "")) {
    return true;
  }

  return (plan.blocks || []).some((block) => {
    const label = (block.date_label || "").trim().toLowerCase();
    if (!label) {
      return true;
    }

    return label.includes("today") || label.includes(currentWeekdayLabel.toLowerCase());
  });
}
