"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import ExecutionRail from "@/components/kai/ExecutionRail";
import DesktopShell from "@/components/layout/DesktopShell";
import type { KaiExecutionBlock } from "@/lib/kai-prompt";
import {
  buildCalendarIntentContext,
  buildCalendarEventsFromPlan,
  getUSHolidaysForYear,
  importPlanToCalendar,
  loadCalendarEvents,
  type CalendarEvent,
} from "@/lib/calendar-store";
import {
  getGoogleCalendarAuthUrl,
  loadGoogleCalendarEvents,
  loadGoogleCalendarStatus,
  syncGoogleCalendarEvents,
  type GoogleCalendarStatus,
} from "@/lib/google-calendar-client";
import {
  buildExecutionPlanFromHistoryRun,
  buildLocalExecutionPlan,
  buildPlannerHistoryContext,
  deletePlannerRun,
  loadPlannerHistory,
  saveExecutionPlan,
  updateExecutionBlockStatus,
  type PlannerHistoryRun,
} from "@/lib/plan-store";
import {
  addMinutesToClock,
  formatMinutesAsClock,
  getRoundedDelayMinutes,
  getTaskFlowMessage,
  isPlanActiveToday,
  isTaskFlowEligibleBlock,
  isMultiDayPlan,
  normalizeExecutionSurface,
  parseClockToMinutes,
} from "@/lib/execution-flow";
import {
  buildDefaultPreferences,
  buildPreferenceContext,
  loadUserPreferences,
  saveUserPreferences,
  type UserPreferences,
} from "@/lib/preferences-store";
import {
  loadLeaderboardPlayers,
  mergeRealtimePlayer,
  mergeRealtimeProfile,
  publishPlayerLiveStatus,
  removeRealtimePlayer,
  type PlayerLiveStatusRealtimeRow,
  upsertUserProfile,
  type LeaderboardPlayer,
  type UserProfileRealtimeRow,
} from "@/lib/multiplayer-store";
import { buildAccountScoreboard, buildScoreboardSummary } from "@/lib/scoreboard";
import {
  LOCK_IN_DOWN_WARNING_AFTER_SECONDS,
  LOCK_IN_PENALTY_AFTER_WARNINGS,
  LOCK_IN_PENALTY_POINTS,
  createEmptyLockInBaseline,
  evaluateLockInFrame,
  formatLockInPoints,
  loadLockInFaceLandmarker,
  updateLockInBaseline,
  type LockInMonitorPhase,
  type LockInPaperMode,
} from "@/lib/lock-in-vision";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";
import { type Message, useKai } from "@/components/kai/use-kai";

export interface ChatViewer {
  id: string | null;
  name: string;
  email: string | null;
  isGuest: boolean;
}

interface KaiChatProps {
  viewer: ChatViewer;
  mode: "live" | "preview";
  liveModelLabel?: string | null;
  onSignOut?: () => void | Promise<void>;
}

type TimerAlertState = {
  blockKey: string;
  title: string;
};

type LockInAlertState = {
  warningCount: number;
  penaltyApplied: boolean;
  penaltyPoints: number;
  title: string;
};

const STARTERS = [
  "Build my schedule from scratch",
  "I have a deadline coming up",
  "My week is a mess — help",
  "I'm a morning person, optimize for that",
];

const PUSH_TO_TALK_KEY = "Alt";
const PREFERENCE_PEAK_OPTIONS: Array<UserPreferences["peakFocus"]> = [
  "unknown",
  "morning",
  "mid-morning",
  "afternoon",
  "evening",
];
const PREFERENCE_LOW_ENERGY_OPTIONS: Array<UserPreferences["lowEnergy"]> = [
  "unknown",
  "morning",
  "afternoon",
  "evening",
];

function roundLockInPoints(value: number) {
  return Math.max(0, Math.round((value + Number.EPSILON) * 10) / 10);
}

function applyLockInBonusToSummary(summary: ReturnType<typeof buildScoreboardSummary>, multiplier: number) {
  if (multiplier <= 1) {
    return summary;
  }

  let currentBoost = 0;
  let targetBoost = 0;
  const entries = summary.entries.map((entry) => {
    if (!entry.isCurrent) {
      return entry;
    }

    const nextEarnedPoints = Math.max(entry.earnedPoints, Math.round(entry.earnedPoints * multiplier));
    const nextTargetPoints = Math.max(entry.targetPoints, Math.round(entry.targetPoints * multiplier));
    currentBoost = nextEarnedPoints - entry.earnedPoints;
    targetBoost = nextTargetPoints - entry.targetPoints;

    return {
      ...entry,
      earnedPoints: nextEarnedPoints,
      targetPoints: nextTargetPoints,
    };
  });

  return {
    ...summary,
    entries,
    totalEarnedPoints: summary.totalEarnedPoints + currentBoost,
    totalAvailablePoints: summary.totalAvailablePoints + targetBoost,
    currentEarnedPoints: summary.currentEarnedPoints + currentBoost,
    currentTargetPoints: summary.currentTargetPoints + targetBoost,
    completedEntries: summary.completedEntries.map((entry) =>
      entry.isCurrent
        ? {
            ...entry,
            earnedPoints: Math.max(entry.earnedPoints, Math.round(entry.earnedPoints * multiplier)),
            targetPoints: Math.max(entry.targetPoints, Math.round(entry.targetPoints * multiplier)),
          }
        : entry,
    ),
  };
}

function KaiLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="white" strokeOpacity="0.9" strokeWidth="1.2" />
      <path
        d="M5.5 5L8 8L5.5 11"
        stroke="white"
        strokeOpacity="0.9"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 5L11 8L9 11"
        stroke="white"
        strokeOpacity="0.5"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MicIcon({ active = false }: { active?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 1.75A1.75 1.75 0 0 1 8.75 3.5V7A1.75 1.75 0 0 1 5.25 7V3.5A1.75 1.75 0 0 1 7 1.75Z"
        stroke={active ? "#18181b" : "currentColor"}
        strokeWidth="1.3"
      />
      <path
        d="M10.5 6.75A3.5 3.5 0 0 1 3.5 6.75"
        stroke={active ? "#18181b" : "currentColor"}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M7 10.5V12.25"
        stroke={active ? "#18181b" : "currentColor"}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M4.75 12.25H9.25"
        stroke={active ? "#18181b" : "currentColor"}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function mergeDraftText(base: string, finalTranscript: string, interimTranscript = "") {
  const spoken = `${finalTranscript}${interimTranscript}`.trim();
  if (!spoken) {
    return base;
  }

  const trimmedBase = base.trimEnd();
  if (!trimmedBase) {
    return spoken;
  }

  const separator = trimmedBase.endsWith("\n") ? "" : " ";
  return `${trimmedBase}${separator}${spoken}`;
}

function mergeTranscriptSnapshot(previousSnapshot: string, nextSnapshot: string) {
  const previous = previousSnapshot.trim();
  const next = nextSnapshot.trim();

  if (!next) {
    return previous;
  }

  if (!previous) {
    return next;
  }

  if (next === previous) {
    return previous;
  }

  if (next.startsWith(previous)) {
    return next;
  }

  if (previous.startsWith(next) || previous.toLowerCase().includes(next.toLowerCase())) {
    return previous;
  }

  const maxOverlap = Math.min(previous.length, next.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    const previousTail = previous.slice(-size).toLowerCase();
    const nextHead = next.slice(0, size).toLowerCase();

    if (previousTail === nextHead) {
      return `${previous} ${next.slice(size)}`.trim();
    }
  }

  return `${previous} ${next}`.trim();
}

function buildTranscriptPreview(committedTranscript: string, interimTranscript: string) {
  const committed = committedTranscript.trim();
  const interim = interimTranscript.trim();

  if (!interim) {
    return committed;
  }

  if (!committed) {
    return interim;
  }

  if (interim.startsWith(committed)) {
    return interim;
  }

  return mergeTranscriptSnapshot(committed, interim);
}

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function appendPlannerNote(existing: string | null | undefined, note: string) {
  if (!existing?.trim()) {
    return note;
  }

  return existing.includes(note) ? existing : `${existing} ${note}`;
}

function applySchoolWindowToBlocks(
  blocks: KaiExecutionBlock[],
  options: {
    enabled: boolean;
    weekdayIndex: number;
    schoolStartTime: string | null;
    schoolEndTime: string | null;
  },
) {
  if (!options.enabled || options.weekdayIndex === 0 || options.weekdayIndex === 6) {
    return blocks;
  }

  const schoolStartMinutes = parseClockToMinutes(options.schoolStartTime || "");
  const schoolEndMinutes = parseClockToMinutes(options.schoolEndTime || "");
  if (schoolStartMinutes === null || schoolEndMinutes === null || schoolEndMinutes <= schoolStartMinutes) {
    return blocks;
  }

  let nextOpenMinutes: number | null = null;

  return blocks.map((block) => {
    if (block.status !== "pending") {
      return block;
    }

    const startMinutes = parseClockToMinutes(block.start_time || "");
    const endMinutes = parseClockToMinutes(block.end_time || "");
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return block;
    }

    const durationMinutes = endMinutes - startMinutes;
    let adjustedStartMinutes = startMinutes;
    let adjusted = false;

    if (nextOpenMinutes !== null && adjustedStartMinutes < nextOpenMinutes) {
      adjustedStartMinutes = nextOpenMinutes;
      adjusted = true;
    }

    const adjustedEndMinutes = adjustedStartMinutes + durationMinutes;
    const overlapsSchool =
      adjustedStartMinutes < schoolEndMinutes && adjustedEndMinutes > schoolStartMinutes;

    if (overlapsSchool) {
      adjustedStartMinutes = Math.max(adjustedStartMinutes, schoolEndMinutes);
      adjusted = true;
    }

    if (!adjusted) {
      nextOpenMinutes = endMinutes + 10;
      return block;
    }

    const finalEndMinutes = adjustedStartMinutes + durationMinutes;
    nextOpenMinutes = finalEndMinutes + 10;

    return {
      ...block,
      start_time: formatMinutesAsClock(adjustedStartMinutes),
      end_time: formatMinutesAsClock(finalEndMinutes),
      notes: appendPlannerNote(
        block.notes,
        `Moved outside weekday school hours (${options.schoolStartTime}–${options.schoolEndTime}).`,
      ),
    };
  });
}

function formatCalendarDateHeading(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatCalendarMonthLabel(value: Date) {
  return value.toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });
}

function toIsoCalendarDate(value: Date) {
  return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())).toISOString().slice(0, 10);
}

function getCalendarMonthGrid(anchor: Date) {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);

    return {
      date,
      isoDate: toIsoCalendarDate(date),
      dayNumber: date.getDate(),
      inCurrentMonth: date.getMonth() === anchor.getMonth(),
      isToday: toIsoCalendarDate(date) === toIsoCalendarDate(new Date()),
    };
  });
}

function getCalendarFetchWindow(anchor: Date) {
  const grid = getCalendarMonthGrid(anchor);
  const first = grid[0]?.date || anchor;
  const last = grid.at(-1)?.date || anchor;
  const rangeEnd = new Date(last);
  rangeEnd.setDate(rangeEnd.getDate() + 1);

  return {
    from: new Date(first.getFullYear(), first.getMonth(), first.getDate()).toISOString(),
    to: new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate()).toISOString(),
  };
}

function formatCalendarTimeRange(startTime: string | null, endTime: string | null) {
  if (!startTime && !endTime) {
    return "All day";
  }

  const format = (value: string | null) => {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) {
      return value || "Time TBD";
    }

    const [hourText, minute] = value.split(":");
    const hour = Number(hourText);
    const suffix = hour >= 12 ? "PM" : "AM";
    const normalizedHour = hour % 12 || 12;
    return `${normalizedHour}:${minute} ${suffix}`;
  };

  return [format(startTime), format(endTime)].filter(Boolean).join(" – ");
}

function mapBrowserSpeechError(error: string) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked for Verge. Allow mic access and try again.";
    case "audio-capture":
      return "No microphone was found for dictation.";
    case "no-speech":
      return "Kai did not catch any speech on that attempt.";
    case "network":
      return "Voice dictation had a network problem. Try again in a moment.";
    default:
      return "Voice dictation could not start cleanly. Try again.";
  }
}

function mapDesktopDictationError(code?: string | null, message?: string | null) {
  switch (code) {
    case "speech-denied":
      return "Speech recognition permission was denied for Verge.";
    case "speech-restricted":
      return "Speech recognition is restricted on this Mac.";
    case "microphone-denied":
      return "Microphone access was denied for Verge.";
    case "recognizer-missing":
      return "Speech recognition could not start for your current language.";
    case "speech-unavailable":
      return "Speech recognition is unavailable right now on this Mac.";
    case "speech-runtime":
      return message || "Desktop dictation stopped unexpectedly.";
    case "bootstrap":
    case "launch":
      return message || "Desktop dictation could not start cleanly.";
    default:
      return message || "Desktop dictation could not start cleanly.";
  }
}

function playTimerCompleteChime() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.35);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.45);
  window.setTimeout(() => {
    void context.close();
  }, 550);
}

async function notifyTimerComplete(title: string) {
  playTimerCompleteChime();

  if (typeof Notification === "undefined") {
    return;
  }

  try {
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }

    if (Notification.permission === "granted") {
      new Notification("Timer complete", {
        body: `${title} is up. Review it, then complete or skip the block.`,
        silent: false,
      });
    }
  } catch {
    // Ignore notification errors and keep the in-app banner path.
  }
}

function subscribeToDesktopBridge() {
  return () => {};
}

function getDesktopSnapshot() {
  return Boolean(window.electron?.isDesktop);
}

function subscribeToSpeechSupport() {
  return () => {};
}

function getSpeechSupportSnapshot() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-3 px-4 py-1 md:px-6">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-white/6">
        <KaiLogo size={14} />
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-white/8 bg-white/[0.06] px-4 py-3">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40"
            style={{ animationDelay: `${index * 0.15}s`, animationDuration: "0.9s" }}
          />
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const bubbleStyle = !isUser ? { scrollbarWidth: "thin" as const } : undefined;

  return (
    <div className={`flex items-end gap-3 px-4 py-1.5 md:px-6 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser ? (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-white/6">
          <KaiLogo size={14} />
        </div>
      ) : null}

      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed md:max-w-[72%] ${
          isUser
            ? "rounded-br-sm bg-white text-zinc-900 shadow-[0_10px_30px_rgba(255,255,255,0.08)]"
            : "max-h-[28rem] overflow-y-auto rounded-bl-sm border border-white/8 bg-white/[0.06] text-white/90"
        }`}
        style={bubbleStyle}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

export default function KaiChat({ viewer, mode, liveModelLabel, onSignOut }: KaiChatProps) {
  const { messages, isLoading, latestProfile, sendMessage, resetConversation } = useKai();
  const supabase = createClient();
  const authConfigured = isSupabaseConfigured();
  const [input, setInput] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [desktopDictationSupported, setDesktopDictationSupported] = useState(false);
  const [plannerHistory, setPlannerHistory] = useState<PlannerHistoryRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(buildDefaultPreferences);
  const [preferenceDraft, setPreferenceDraft] = useState<UserPreferences>(buildDefaultPreferences);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarImporting, setCalendarImporting] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [googleCalendarEvents, setGoogleCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarMonthAnchor, setCalendarMonthAnchor] = useState(() => new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => toIsoCalendarDate(new Date()));
  const [calendarStatus, setCalendarStatus] = useState<string | null>(null);
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState<GoogleCalendarStatus | null>(null);
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false);
  const [googleCalendarSyncing, setGoogleCalendarSyncing] = useState(false);
  const [lastRequestWantedCalendar, setLastRequestWantedCalendar] = useState(false);
  const [deletingHistoryRunId, setDeletingHistoryRunId] = useState<string | null>(null);
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<string | null>(null);
  const [showHistoryPlan, setShowHistoryPlan] = useState(false);
  const [planStatusOverrides, setPlanStatusOverrides] = useState<Record<string, "pending" | "completed" | "skipped">>(
    {},
  );
  const [planProgressOverrides, setPlanProgressOverrides] = useState<
    Record<string, { trackedElapsedSeconds: number; earnedPoints: number }>
  >({});
  const [persistedPlanKey, setPersistedPlanKey] = useState<string | null>(null);
  const [persistErrorPlanKey, setPersistErrorPlanKey] = useState<string | null>(null);
  const [persistedRunState, setPersistedRunState] = useState<{ planKey: string; runId: string } | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState(0);
  const [timerBlockKey, setTimerBlockKey] = useState<string | null>(null);
  const [blockElapsedSeconds, setBlockElapsedSeconds] = useState<Record<string, number>>({});
  const [timerAlert, setTimerAlert] = useState<TimerAlertState | null>(null);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [lockInModeEnabled, setLockInModeEnabled] = useState(false);
  const [lockInPaperMode, setLockInPaperMode] = useState<LockInPaperMode | null>(null);
  const [lockInMonitorPhase, setLockInMonitorPhase] = useState<LockInMonitorPhase>("off");
  const [lockInCameraError, setLockInCameraError] = useState<string | null>(null);
  const [lockInWarningCount, setLockInWarningCount] = useState(0);
  const [lockInPenaltyPoints, setLockInPenaltyPoints] = useState(0);
  const [lockInDownSeconds, setLockInDownSeconds] = useState(0);
  const [lockInEyesAwaySeconds, setLockInEyesAwaySeconds] = useState(0);
  const [lockInAlert, setLockInAlert] = useState<LockInAlertState | null>(null);
  const [multiplayerPlayers, setMultiplayerPlayers] = useState<LeaderboardPlayer[]>([]);
  const [multiplayerLoading, setMultiplayerLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const dictationBaseRef = useRef("");
  const dictatedTextRef = useRef("");
  const dictationInterimRef = useRef("");
  const activeDesktopSessionIdRef = useRef<number | null>(null);
  const keepDictationAliveRef = useRef(false);
  const suppressNextDictationCommitRef = useRef(false);
  const restartDictationTimerRef = useRef<number | null>(null);
  const pushToTalkActiveRef = useRef(false);
  const persistRequestPlanKeyRef = useRef<string | null>(null);
  const lastUserPromptRef = useRef("");
  const alertedTimerBlockKeyRef = useRef<string | null>(null);
  const lockInVideoRef = useRef<HTMLVideoElement | null>(null);
  const lockInStreamRef = useRef<MediaStream | null>(null);
  const lockInFrameRef = useRef<number | null>(null);
  const lockInLastSampleAtRef = useRef(0);
  const lockInBaselineRef = useRef(createEmptyLockInBaseline());
  const lockInDownSinceRef = useRef<number | null>(null);
  const lockInEyesAwaySinceRef = useRef<number | null>(null);
  const lockInResumeTimerRef = useRef(false);
  const lockInCalibrationUntilRef = useRef(0);
  const lockInLandmarkerRef = useRef<Awaited<ReturnType<typeof loadLockInFaceLandmarker>> | null>(null);
  const lockInVisionRetryCountRef = useRef(0);
  const lockInLastVideoTimeRef = useRef<number>(-1);
  const isDesktop = useSyncExternalStore(subscribeToDesktopBridge, getDesktopSnapshot, () => false);
  const browserSpeechSupported = useSyncExternalStore(subscribeToSpeechSupport, getSpeechSupportSnapshot, () => false);
  const electronPlatform = typeof window !== "undefined" ? window.electron?.platform || null : null;
  const useNativeDesktopDictation = isDesktop && electronPlatform === "darwin";
  const pushToTalkKeyLabel = electronPlatform === "darwin" ? "Option" : PUSH_TO_TALK_KEY;
  const speechSupported = useNativeDesktopDictation ? desktopDictationSupported : browserSpeechSupported;
  const generatedPlan = useMemo(() => buildLocalExecutionPlan(latestProfile), [latestProfile]);
  const currentGeneratedPlan = useMemo(() => {
    if (!generatedPlan) {
      return null;
    }

    return {
      ...generatedPlan,
      blocks: generatedPlan.blocks.map((block) => ({
        ...block,
        ...(planProgressOverrides[`${generatedPlan.plan_id}:${block.id}`]
          ? {
              tracked_elapsed_seconds: planProgressOverrides[`${generatedPlan.plan_id}:${block.id}`].trackedElapsedSeconds,
              earned_points: planProgressOverrides[`${generatedPlan.plan_id}:${block.id}`].earnedPoints,
            }
          : {}),
        status: planStatusOverrides[`${generatedPlan.plan_id}:${block.id}`] ?? block.status,
      })),
    };
  }, [generatedPlan, planProgressOverrides, planStatusOverrides]);
  const activeHistoryRun = useMemo(() => {
    if (!plannerHistory.length || !selectedHistoryRunId) {
      return null;
    }

    return plannerHistory.find((run) => run.id === selectedHistoryRunId) || null;
  }, [plannerHistory, selectedHistoryRunId]);
  const historyPlan = useMemo(() => {
    if (!activeHistoryRun) {
      return null;
    }

    const basePlan = buildExecutionPlanFromHistoryRun(activeHistoryRun);
    if (!basePlan) {
      return null;
    }

    return {
      ...basePlan,
      blocks: basePlan.blocks.map((block) => ({
        ...block,
        ...(planProgressOverrides[`${basePlan.plan_id}:${block.id}`]
          ? {
              tracked_elapsed_seconds: planProgressOverrides[`${basePlan.plan_id}:${block.id}`].trackedElapsedSeconds,
              earned_points: planProgressOverrides[`${basePlan.plan_id}:${block.id}`].earnedPoints,
            }
          : {}),
        status: planStatusOverrides[`${basePlan.plan_id}:${block.id}`] ?? block.status,
      })),
    };
  }, [activeHistoryRun, planProgressOverrides, planStatusOverrides]);
  const activePlanSource =
    showHistoryPlan && historyPlan
      ? ("history" as const)
      : currentGeneratedPlan
        ? ("live" as const)
        : historyPlan
          ? ("history" as const)
          : ("none" as const);
  const fullExecutionPlan =
    activePlanSource === "history" ? historyPlan : activePlanSource === "live" ? currentGeneratedPlan : null;
  const activeProfile = activePlanSource === "history" ? activeHistoryRun?.rawProfile ?? latestProfile : latestProfile;
  const preferenceContext = useMemo(() => buildPreferenceContext(preferences), [preferences]);
  const currentWeekdayLabel = useMemo(
    () => new Date(clockTick).toLocaleDateString([], { weekday: "long" }),
    [clockTick],
  );
  const currentWeekdayIndex = useMemo(() => new Date(clockTick).getDay(), [clockTick]);
  const multiDayCalendarMode = useMemo(
    () => Boolean(fullExecutionPlan && isMultiDayPlan(fullExecutionPlan) && lastRequestWantedCalendar),
    [fullExecutionPlan, lastRequestWantedCalendar],
  );
  const taskFlowMessage = useMemo(() => {
    if (multiDayCalendarMode) {
      return "Multi-day schedules live in Calendar right now. Import this plan there to place every block across days.";
    }

    return getTaskFlowMessage(fullExecutionPlan);
  }, [fullExecutionPlan, multiDayCalendarMode]);
  const executionPlan = useMemo(() => {
    if (!fullExecutionPlan) {
      return null;
    }

    if (multiDayCalendarMode) {
      return {
        ...fullExecutionPlan,
        blocks: [],
      };
    }

    const filteredBlocks = fullExecutionPlan.blocks
      .filter((block) => isTaskFlowEligibleBlock(block))
      .map((block) => ({
        ...block,
        execution_surface: normalizeExecutionSurface(block),
      }));

    if (!filteredBlocks.length) {
      return {
        ...fullExecutionPlan,
        blocks: [],
      };
    }

    const schoolAdjustedBlocks = applySchoolWindowToBlocks(filteredBlocks, {
      enabled: activePlanSource === "live" && preferences.schoolEnabled,
      weekdayIndex: currentWeekdayIndex,
      schoolStartTime: preferences.schoolStartTime,
      schoolEndTime: preferences.schoolEndTime,
    });

    if (
      activePlanSource !== "live" ||
      timerRunning ||
      !isPlanActiveToday(fullExecutionPlan, currentWeekdayLabel)
    ) {
      return {
        ...fullExecutionPlan,
        blocks: schoolAdjustedBlocks,
      };
    }

    const firstPendingIndex = schoolAdjustedBlocks.findIndex((block) => block.status === "pending");
    if (firstPendingIndex === -1) {
      return {
        ...fullExecutionPlan,
        blocks: schoolAdjustedBlocks,
      };
    }

    const firstPendingBlock = schoolAdjustedBlocks[firstPendingIndex];
    const firstPendingKey = `${fullExecutionPlan.plan_id}:${firstPendingBlock.id}`;
    if ((blockElapsedSeconds[firstPendingKey] || 0) > 0) {
      return {
        ...fullExecutionPlan,
        blocks: schoolAdjustedBlocks,
      };
    }

    const scheduledMinutes = parseClockToMinutes(firstPendingBlock.start_time);
    if (scheduledMinutes === null) {
      return {
        ...fullExecutionPlan,
        blocks: schoolAdjustedBlocks,
      };
    }

    const now = new Date(clockTick);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const shiftMinutes = getRoundedDelayMinutes(nowMinutes, scheduledMinutes);
    if (!shiftMinutes) {
      return {
        ...fullExecutionPlan,
        blocks: schoolAdjustedBlocks,
      };
    }

    return {
      ...fullExecutionPlan,
      blocks: schoolAdjustedBlocks.map((block, index) => {
        if (index < firstPendingIndex || block.status !== "pending") {
          return block;
        }

        return {
          ...block,
          start_time: addMinutesToClock(block.start_time, shiftMinutes),
          end_time: addMinutesToClock(block.end_time, shiftMinutes),
          notes: block.notes
            ? `${block.notes} Shifted ${shiftMinutes} min because the block was not started on time.`
            : `Shifted ${shiftMinutes} min because the block was not started on time.`,
        };
      }),
    };
  }, [
    activePlanSource,
    blockElapsedSeconds,
    clockTick,
    currentWeekdayLabel,
    currentWeekdayIndex,
    fullExecutionPlan,
    multiDayCalendarMode,
    preferences.schoolEnabled,
    preferences.schoolEndTime,
    preferences.schoolStartTime,
    timerRunning,
  ]);
  const taskFlowHistoryRuns = useMemo(
    () =>
      plannerHistory.map((run) => {
        const filteredBlocks = run.blocks
          .filter((block) => isTaskFlowEligibleBlock(block))
          .map((block) => ({
            ...block,
            execution_surface: normalizeExecutionSurface(block),
          }));

        return {
          ...run,
          blocks: filteredBlocks,
        };
      }),
    [plannerHistory],
  );
  const currentBlock = executionPlan?.blocks.find((block) => block.status === "pending") ?? null;
  const currentTimerKey = executionPlan && currentBlock ? `${executionPlan.plan_id}:${currentBlock.id}` : null;
  const activeRunId =
    activePlanSource === "history"
      ? activeHistoryRun?.id ?? null
      : currentGeneratedPlan && persistedRunState?.planKey === currentGeneratedPlan.plan_id
        ? persistedRunState.runId
        : null;
  const activePlanKey = executionPlan?.plan_id ?? null;
  const currentTrackedElapsedSeconds = currentTimerKey ? Math.max(0, blockElapsedSeconds[currentTimerKey] || 0) : 0;
  const effectiveTimerRemainingSeconds =
    currentTimerKey && timerBlockKey === currentTimerKey
      ? timerRemainingSeconds
      : Math.max(0, (currentBlock?.duration_minutes || 0) * 60 - currentTrackedElapsedSeconds);
  const storageState = useMemo(() => {
    if (!authConfigured) {
      return "disabled" as const;
    }

    if (!generatedPlan || !supabase || !viewer.id) {
      return "local" as const;
    }

    if (persistErrorPlanKey === generatedPlan.plan_id) {
      return "error" as const;
    }

    if (persistedPlanKey === generatedPlan.plan_id) {
      return "saved" as const;
    }

    return "saving" as const;
  }, [authConfigured, generatedPlan, persistErrorPlanKey, persistedPlanKey, supabase, viewer.id]);
  const timerLabel = formatCountdown(effectiveTimerRemainingSeconds);
  const timerProgressPercent = useMemo(() => {
    if (!currentBlock?.duration_minutes) {
      return 0;
    }

    const total = currentBlock.duration_minutes * 60;
    if (total <= 0) {
      return 0;
    }

    return (effectiveTimerRemainingSeconds / total) * 100;
  }, [currentBlock, effectiveTimerRemainingSeconds]);
  const scoreboard = useMemo(
    () =>
      buildScoreboardSummary({
        plan: executionPlan,
        elapsedSecondsByBlock: blockElapsedSeconds,
        currentBlockKey: currentTimerKey,
      }),
    [blockElapsedSeconds, currentTimerKey, executionPlan],
  );
  const accountScoreboard = useMemo(
    () =>
      buildAccountScoreboard({
        historyRuns: taskFlowHistoryRuns,
        activePlan: executionPlan,
        activeRunId,
        elapsedSecondsByBlock: blockElapsedSeconds,
        currentBlockKey: currentTimerKey,
      }),
    [activeRunId, blockElapsedSeconds, currentTimerKey, executionPlan, taskFlowHistoryRuns],
  );
  const lockInPointsMultiplier = lockInModeEnabled && lockInPaperMode === "computer_only" ? 2 : 1;
  const boostedScoreboard = useMemo(
    () => applyLockInBonusToSummary(scoreboard, lockInPointsMultiplier),
    [lockInPointsMultiplier, scoreboard],
  );
  const boostedAccountScoreboard = useMemo(
    () => applyLockInBonusToSummary(accountScoreboard, lockInPointsMultiplier),
    [accountScoreboard, lockInPointsMultiplier],
  );
  const adjustedScoreboard = useMemo(
    () => ({
      ...boostedScoreboard,
      totalEarnedPoints: roundLockInPoints(Math.max(0, boostedScoreboard.totalEarnedPoints - lockInPenaltyPoints)),
    }),
    [boostedScoreboard, lockInPenaltyPoints],
  );
  const adjustedAccountScoreboard = useMemo(
    () => ({
      ...boostedAccountScoreboard,
      totalEarnedPoints: roundLockInPoints(Math.max(0, boostedAccountScoreboard.totalEarnedPoints - lockInPenaltyPoints)),
    }),
    [boostedAccountScoreboard, lockInPenaltyPoints],
  );
  const penaltyStorageKey = useMemo(() => {
    if (viewer.id) {
      return `verge-lock-in-penalty:${viewer.id}`;
    }

    if (viewer.email) {
      return `verge-lock-in-penalty:${viewer.email}`;
    }

    return null;
  }, [viewer.email, viewer.id]);
  const activePlanAlreadyInCalendar = useMemo(() => {
    const planKey = fullExecutionPlan?.plan_id;
    if (!planKey) {
      return false;
    }

    return calendarEvents.some((event) => event.sourcePlanKey === planKey);
  }, [calendarEvents, fullExecutionPlan]);
  const shouldPromptCalendarImport = Boolean(
    fullExecutionPlan &&
      !activePlanAlreadyInCalendar &&
      (lastRequestWantedCalendar || fullExecutionPlan.timeline_mode === "multi_day"),
  );
  const visibleCalendarEvents = useMemo(() => {
    if (googleCalendarStatus?.connected) {
      return googleCalendarEvents
        .slice()
        .sort((left, right) =>
          `${left.eventDate}${left.startTime || "99:99"}${left.title}`.localeCompare(
            `${right.eventDate}${right.startTime || "99:99"}${right.title}`,
          ),
        );
    }

    return [] as CalendarEvent[];
  }, [googleCalendarEvents, googleCalendarStatus?.connected]);
  const calendarMonthGrid = useMemo(() => getCalendarMonthGrid(calendarMonthAnchor), [calendarMonthAnchor]);
  const visibleCalendarHolidayMap = useMemo(() => {
    const holidayMap = new Map<string, string>();
    const years = new Set(calendarMonthGrid.map((cell) => cell.date.getFullYear()));

    for (const year of years) {
      for (const [date, label] of getUSHolidaysForYear(year)) {
        holidayMap.set(date, label);
      }
    }

    return holidayMap;
  }, [calendarMonthGrid]);
  const selectedCalendarEvents = useMemo(
    () =>
      visibleCalendarEvents.filter((event) => event.eventDate === selectedCalendarDate).sort((left, right) =>
        `${left.startTime || "99:99"}${left.title}`.localeCompare(`${right.startTime || "99:99"}${right.title}`),
      ),
    [selectedCalendarDate, visibleCalendarEvents],
  );
  const selectedCalendarHoliday = visibleCalendarHolidayMap.get(selectedCalendarDate) || null;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockTick(Date.now());
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!penaltyStorageKey) {
      const frame = window.requestAnimationFrame(() => {
        setLockInPenaltyPoints(0);
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    const frame = window.requestAnimationFrame(() => {
      const storedValue = window.localStorage.getItem(penaltyStorageKey);
      const parsedValue = storedValue == null ? 0 : Number(storedValue);
      setLockInPenaltyPoints(Number.isFinite(parsedValue) ? Math.max(0, parsedValue) : 0);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [penaltyStorageKey]);

  useEffect(() => {
    if (!penaltyStorageKey) {
      return;
    }

    window.localStorage.setItem(penaltyStorageKey, String(roundLockInPoints(lockInPenaltyPoints)));
  }, [lockInPenaltyPoints, penaltyStorageKey]);

  const clearLockInMonitoring = useCallback(() => {
    if (lockInFrameRef.current !== null) {
      window.cancelAnimationFrame(lockInFrameRef.current);
      lockInFrameRef.current = null;
    }

    lockInLastSampleAtRef.current = 0;
    lockInLastVideoTimeRef.current = -1;
    lockInDownSinceRef.current = null;
    lockInEyesAwaySinceRef.current = null;
    lockInCalibrationUntilRef.current = 0;
    lockInVisionRetryCountRef.current = 0;
    lockInBaselineRef.current = createEmptyLockInBaseline();
    setLockInDownSeconds(0);
    setLockInEyesAwaySeconds(0);

    if (lockInStreamRef.current) {
      for (const track of lockInStreamRef.current.getTracks()) {
        track.stop();
      }
      lockInStreamRef.current = null;
    }

    const video = lockInVideoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }, []);

  const resetLockInTaskState = useCallback(
    (options?: { preservePenalty?: boolean; preservePaperMode?: boolean; preserveWarnings?: boolean }) => {
      clearLockInMonitoring();
      lockInResumeTimerRef.current = false;
      setLockInModeEnabled(false);
      setLockInMonitorPhase("off");
      setLockInCameraError(null);
      setLockInAlert(null);

      if (!options?.preservePaperMode) {
        setLockInPaperMode(null);
      }
      if (!options?.preserveWarnings) {
        setLockInWarningCount(0);
      }
      if (!options?.preservePenalty) {
        setLockInPenaltyPoints(0);
      }
    },
    [clearLockInMonitoring],
  );

  const applyLockInWarning = useCallback(
    (reason: string) => {
      clearLockInMonitoring();
      setLockInMonitorPhase("alert");
      setTimerRunning(false);
      lockInResumeTimerRef.current = true;

      setLockInWarningCount((currentValue) => {
        const nextWarningCount = currentValue + 1;
        const penaltyApplied = nextWarningCount > LOCK_IN_PENALTY_AFTER_WARNINGS;
        const penaltyPoints = penaltyApplied ? LOCK_IN_PENALTY_POINTS : 0;

        if (penaltyApplied) {
          setLockInPenaltyPoints((currentPenalty) => roundLockInPoints(currentPenalty + penaltyPoints));
        }

        setLockInAlert({
          warningCount: nextWarningCount,
          penaltyApplied,
          penaltyPoints,
          title: reason,
        });

        return nextWarningCount;
      });
    },
    [clearLockInMonitoring],
  );

  const handleDismissLockInAlert = useCallback(() => {
    setLockInAlert(null);
    setLockInCameraError(null);
    setLockInDownSeconds(0);
    setLockInEyesAwaySeconds(0);
    lockInDownSinceRef.current = null;
    lockInEyesAwaySinceRef.current = null;
    lockInBaselineRef.current = createEmptyLockInBaseline();

    if (!lockInModeEnabled) {
      setLockInMonitorPhase("off");
      return;
    }

    if (lockInPaperMode === "paper_allowed") {
      setLockInMonitorPhase("monitoring");
      return;
    }

    if (lockInPaperMode === "computer_only") {
      setLockInMonitorPhase(lockInResumeTimerRef.current ? "requesting_camera" : "setup");
      if (lockInResumeTimerRef.current) {
        lockInResumeTimerRef.current = false;
        setTimerRunning(true);
      }
      return;
    }

    setLockInMonitorPhase("setup");
  }, [lockInModeEnabled, lockInPaperMode]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      resetLockInTaskState({ preservePenalty: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [currentTimerKey, resetLockInTaskState]);

  useEffect(() => {
    return () => {
      clearLockInMonitoring();
    };
  }, [clearLockInMonitoring]);

  useEffect(() => {
    if (!lockInModeEnabled || lockInPaperMode !== "computer_only" || !currentTimerKey || !timerRunning || lockInAlert) {
      const frame = window.requestAnimationFrame(() => {
        clearLockInMonitoring();
        if (!lockInModeEnabled) {
          setLockInMonitorPhase("off");
        } else if (lockInPaperMode === "paper_allowed") {
          setLockInMonitorPhase("monitoring");
        } else if (lockInPaperMode === "computer_only" && !lockInAlert) {
          setLockInMonitorPhase("setup");
        }
      });

      return () => {
        window.cancelAnimationFrame(frame);
      };
      return;
    }

    let cancelled = false;

    async function startMonitoring() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setLockInMonitorPhase("error");
        setLockInCameraError("Camera access is not available in this browser or desktop shell.");
        return;
      }

      setLockInCameraError(null);
      setLockInMonitorPhase("requesting_camera");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });

        if (cancelled) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }

        const video = lockInVideoRef.current;
        if (!video) {
          throw new Error("Camera preview could not initialize.");
        }

        lockInStreamRef.current = stream;
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();

        const landmarker = lockInLandmarkerRef.current ?? (await loadLockInFaceLandmarker());
        lockInLandmarkerRef.current = landmarker;
        lockInBaselineRef.current = createEmptyLockInBaseline();
        lockInCalibrationUntilRef.current = performance.now() + 3200;
        lockInDownSinceRef.current = null;
        lockInEyesAwaySinceRef.current = null;
        lockInVisionRetryCountRef.current = 0;
        lockInLastVideoTimeRef.current = -1;
        setLockInDownSeconds(0);
        setLockInEyesAwaySeconds(0);
        setLockInMonitorPhase("calibrating");

        const step = () => {
          if (cancelled) {
            return;
          }

          const now = performance.now();
          if (lockInLastSampleAtRef.current && now - lockInLastSampleAtRef.current < 250) {
            lockInFrameRef.current = window.requestAnimationFrame(step);
            return;
          }
          lockInLastSampleAtRef.current = now;

          if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
            lockInFrameRef.current = window.requestAnimationFrame(step);
            return;
          }

          if (video.currentTime === lockInLastVideoTimeRef.current) {
            lockInFrameRef.current = window.requestAnimationFrame(step);
            return;
          }
          lockInLastVideoTimeRef.current = video.currentTime;

          let evaluation;
          try {
            const result = landmarker.detectForVideo(video, now);
            lockInVisionRetryCountRef.current = 0;
            evaluation = evaluateLockInFrame({
              landmarks: result.faceLandmarks?.[0],
              matrix: result.facialTransformationMatrixes?.[0],
              baseline: lockInBaselineRef.current,
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : typeof error === "string" ? error : "Lock-in mode hit a camera runtime issue.";
            lockInVisionRetryCountRef.current += 1;
            const allowExtendedWarmupRetry =
              /xnnpack|delegate|tensor/i.test(message) && lockInVisionRetryCountRef.current <= 12;

            if (
              lockInVisionRetryCountRef.current <= 6 ||
              allowExtendedWarmupRetry
            ) {
              setLockInMonitorPhase("calibrating");
              lockInFrameRef.current = window.requestAnimationFrame(step);
              return;
            }

            clearLockInMonitoring();
            setLockInMonitorPhase("error");
            setLockInCameraError("Lock-in mode hit a camera/vision runtime issue. Turn it off and back on to retry.");
            return;
          }

          if (!evaluation.faceDetected) {
            lockInDownSinceRef.current = null;
            lockInEyesAwaySinceRef.current = null;
            setLockInDownSeconds(0);
            setLockInEyesAwaySeconds(0);
            lockInFrameRef.current = window.requestAnimationFrame(step);
            return;
          }

          if (
            now < lockInCalibrationUntilRef.current ||
            lockInBaselineRef.current.samples < 10
          ) {
            lockInBaselineRef.current = updateLockInBaseline(lockInBaselineRef.current, evaluation);
            setLockInMonitorPhase("calibrating");
            lockInDownSinceRef.current = null;
            lockInEyesAwaySinceRef.current = null;
            setLockInDownSeconds(0);
            setLockInEyesAwaySeconds(0);
            lockInFrameRef.current = window.requestAnimationFrame(step);
            return;
          }

          if (evaluation.downSignal) {
            if (lockInDownSinceRef.current === null) {
              lockInDownSinceRef.current = now;
            }
            const downwardSeconds = Math.max(0, Math.floor((now - lockInDownSinceRef.current) / 1000));
            setLockInDownSeconds(downwardSeconds);
            setLockInMonitorPhase("monitoring");

            if (downwardSeconds >= LOCK_IN_DOWN_WARNING_AFTER_SECONDS) {
              applyLockInWarning("You looked down for too long");
              return;
            }
          } else {
            lockInDownSinceRef.current = null;
            setLockInDownSeconds(0);
          }

          if (evaluation.eyesAwaySignal) {
            if (lockInEyesAwaySinceRef.current === null) {
              lockInEyesAwaySinceRef.current = now;
            }
            const eyesAwaySeconds = Math.max(0, Math.floor((now - lockInEyesAwaySinceRef.current) / 1000));
            setLockInEyesAwaySeconds(eyesAwaySeconds);
            setLockInMonitorPhase("monitoring");

            if (eyesAwaySeconds >= LOCK_IN_DOWN_WARNING_AFTER_SECONDS) {
              const directionLabel =
                evaluation.eyesAwayLabel === "left" || evaluation.eyesAwayLabel === "right"
                  ? `eyes were pointed ${evaluation.eyesAwayLabel}`
                  : evaluation.eyesAwayLabel === "down"
                    ? "eyes stayed off-screen"
                    : "eyes drifted away from the screen";
              applyLockInWarning(`Your ${directionLabel} for too long`);
              return;
            }
          } else {
            lockInEyesAwaySinceRef.current = null;
            setLockInEyesAwaySeconds(0);
          }

          if (!evaluation.downSignal && !evaluation.eyesAwaySignal) {
            lockInBaselineRef.current = updateLockInBaseline(lockInBaselineRef.current, evaluation);
            setLockInMonitorPhase("monitoring");
          }

          lockInFrameRef.current = window.requestAnimationFrame(step);
        };

        lockInFrameRef.current = window.requestAnimationFrame(step);
      } catch (error) {
        console.warn("[Verge] Lock-in mode camera failed:", error);
        clearLockInMonitoring();
        if (!cancelled) {
          setLockInMonitorPhase("error");
          setLockInCameraError(
            error instanceof Error
              ? error.message
              : "Camera monitoring could not start. Check permissions and try again.",
          );
        }
      }
    }

    void startMonitoring();

    return () => {
      cancelled = true;
      clearLockInMonitoring();
    };
  }, [applyLockInWarning, clearLockInMonitoring, currentTimerKey, lockInAlert, lockInModeEnabled, lockInPaperMode, timerRunning]);

  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (!cancelled) {
        setPreferencesLoading(true);
      }
    });

    void loadUserPreferences({
      supabase,
      userId: viewer.id,
    })
      .then((loadedPreferences) => {
        if (cancelled) {
          return;
        }

        setPreferences(loadedPreferences);
        setPreferenceDraft(loadedPreferences);
      })
      .finally(() => {
        if (!cancelled) {
          setPreferencesLoading(false);
        }
      });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [supabase, viewer.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    return () => {
      if (restartDictationTimerRef.current) {
        window.clearTimeout(restartDictationTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) {
      return;
    }

    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [input]);

  const refreshPlannerHistory = useCallback(async () => {
    const viewerId = viewer.id;
    if (!supabase || !viewerId) {
      setPlannerHistory([]);
      setSelectedHistoryRunId(null);
      return;
    }

    setHistoryLoading(true);
    try {
      const runs = await loadPlannerHistory({
        supabase,
        userId: viewerId,
      });
      setPlannerHistory(runs);
      setSelectedHistoryRunId((currentValue) => {
        return currentValue && runs.some((run) => run.id === currentValue) ? currentValue : null;
      });
    } catch (error) {
      console.error("[Verge] Failed to load planner history:", error);
      setPlannerHistory([]);
      setSelectedHistoryRunId(null);
    } finally {
      setHistoryLoading(false);
    }
  }, [supabase, viewer.id]);

  const refreshCalendarEvents = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const events = await loadCalendarEvents({
        supabase,
        userId: viewer.id,
      });
      setCalendarEvents(events);
    } finally {
      setCalendarLoading(false);
    }
  }, [supabase, viewer.id]);

  const getViewerAccessToken = useCallback(async () => {
    if (!supabase || !viewer.id) {
      return null;
    }

    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }, [supabase, viewer.id]);

  const refreshGoogleCalendarStatus = useCallback(async () => {
    if (!viewer.id) {
      setGoogleCalendarStatus(null);
      return null;
    }

    const accessToken = await getViewerAccessToken();
    if (!accessToken) {
      setGoogleCalendarStatus(null);
      return null;
    }

    setGoogleCalendarLoading(true);
    try {
      const status = await loadGoogleCalendarStatus(accessToken);
      setGoogleCalendarStatus(status);
      return status;
    } catch (error) {
      console.error("[Verge] Failed to load Google Calendar status:", error);
      setGoogleCalendarStatus(null);
      return null;
    } finally {
      setGoogleCalendarLoading(false);
    }
  }, [getViewerAccessToken, viewer.id]);

  const refreshGoogleCalendarEvents = useCallback(async (anchorDate?: Date) => {
    if (!viewer.id) {
      setGoogleCalendarEvents([]);
      return;
    }

    const accessToken = await getViewerAccessToken();
    if (!accessToken) {
      setGoogleCalendarEvents([]);
      return;
    }

    try {
      const range = getCalendarFetchWindow(anchorDate || calendarMonthAnchor);
      const response = await loadGoogleCalendarEvents({
        accessToken,
        from: range.from,
        to: range.to,
      });
      setGoogleCalendarEvents(
        response.events.map((event) => ({
          ...event,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })),
      );
    } catch (error) {
      console.error("[Verge] Failed to load live Google Calendar events:", error);
      setGoogleCalendarEvents([]);
    }
  }, [calendarMonthAnchor, getViewerAccessToken, viewer.id]);

  const refreshCalendarPanel = useCallback(async (anchorDate?: Date) => {
    const [, status] = await Promise.all([refreshCalendarEvents(), refreshGoogleCalendarStatus()]);
    if (status?.connected) {
      await refreshGoogleCalendarEvents(anchorDate);
      return;
    }

    setGoogleCalendarEvents([]);
  }, [refreshCalendarEvents, refreshGoogleCalendarEvents, refreshGoogleCalendarStatus]);

  const refreshMultiplayerPlayers = useCallback(async () => {
    if (!supabase || !viewer.id) {
      setMultiplayerPlayers([]);
      return;
    }

    setMultiplayerLoading(true);
    try {
      const players = await loadLeaderboardPlayers(supabase);
      setMultiplayerPlayers(players);
    } catch (error) {
      console.error("[Verge] Failed to load multiplayer leaderboard:", error);
      setMultiplayerPlayers([]);
    } finally {
      setMultiplayerLoading(false);
    }
  }, [supabase, viewer.id]);

  const applyLocalBlockProgress = useCallback(
    ({
      planKey,
      runId,
      blockId,
      status,
      elapsedSeconds,
      earnedPoints,
    }: {
      planKey: string;
      runId: string | null;
      blockId: string;
      status?: "pending" | "completed" | "skipped";
      elapsedSeconds: number;
      earnedPoints: number;
    }) => {
      const normalizedElapsed = Math.max(0, Math.floor(elapsedSeconds));
      const normalizedPoints = Math.max(0, Math.floor(earnedPoints));

      setPlanProgressOverrides((currentValue) => ({
        ...currentValue,
        [`${planKey}:${blockId}`]: {
          trackedElapsedSeconds: normalizedElapsed,
          earnedPoints: normalizedPoints,
        },
      }));

      if (!runId) {
        return;
      }

      setPlannerHistory((currentRuns) =>
        currentRuns.map((run) =>
          run.id !== runId
            ? run
            : {
                ...run,
                blocks: run.blocks.map((block) =>
                  block.id !== blockId
                    ? block
                    : {
                        ...block,
                        ...(status ? { status } : {}),
                        tracked_elapsed_seconds: normalizedElapsed,
                        earned_points: normalizedPoints,
                      },
                ),
              },
        ),
      );
    },
    [],
  );

  const persistBlockProgress = useCallback(
    async ({
      runId,
      planKey,
      block,
      status,
      elapsedSeconds,
      earnedPoints,
      syncLocal = true,
      reportErrors = true,
    }: {
      runId: string | null;
      planKey: string;
      block: KaiExecutionBlock;
      status: "pending" | "completed" | "skipped";
      elapsedSeconds: number;
      earnedPoints: number;
      syncLocal?: boolean;
      reportErrors?: boolean;
    }) => {
      if (syncLocal) {
        applyLocalBlockProgress({
          planKey,
          runId,
          blockId: block.id,
          status,
          elapsedSeconds,
          earnedPoints,
        });
      }

      if (!supabase || !runId) {
        return;
      }

      try {
        await updateExecutionBlockStatus({
          supabase,
          runId,
          blockId: block.id,
          status,
          elapsedSeconds,
          earnedPoints,
          pointValue: block.point_value ?? null,
          priorityBand: block.priority_band ?? null,
          executionSurface: block.execution_surface ?? normalizeExecutionSurface(block),
        });
      } catch (error) {
        if (reportErrors) {
          console.error("[Verge] Failed to update execution block:", error);
          setPersistErrorPlanKey(planKey);
        } else {
          console.error("[Verge] Failed to persist live progress:", error);
        }
      }
    },
    [applyLocalBlockProgress, supabase],
  );

  useEffect(() => {
    let cancelled = false;

    if (!supabase || !viewer.id) {
      const frame = window.requestAnimationFrame(() => {
        setPlannerHistory([]);
        setSelectedHistoryRunId(null);
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    const viewerId = viewer.id;

    const frame = window.requestAnimationFrame(() => {
      setHistoryLoading(true);
      void loadPlannerHistory({
        supabase,
        userId: viewerId,
      })
        .then((runs) => {
          if (cancelled) {
            return;
          }

          setPlannerHistory(runs);
          setSelectedHistoryRunId((currentValue) => {
            return currentValue && runs.some((run) => run.id === currentValue) ? currentValue : null;
          });
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          console.error("[Verge] Failed to load planner history:", error);
          setPlannerHistory([]);
          setSelectedHistoryRunId(null);
        })
        .finally(() => {
          if (!cancelled) {
            setHistoryLoading(false);
          }
        });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [supabase, viewer.id]);

  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (!cancelled) {
        setCalendarLoading(true);
      }
    });
    void loadCalendarEvents({
      supabase,
      userId: viewer.id,
    })
      .then((events) => {
        if (!cancelled) {
          setCalendarEvents(events);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCalendarLoading(false);
        }
      });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [supabase, viewer.id]);

  useEffect(() => {
    if (!calendarOpen) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void refreshCalendarPanel(calendarMonthAnchor);
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [calendarMonthAnchor, calendarOpen, refreshCalendarPanel]);

  useEffect(() => {
    if (!calendarOpen) {
      return;
    }

    function handleWindowFocus() {
      void refreshCalendarPanel(calendarMonthAnchor);
    }

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleWindowFocus);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleWindowFocus);
    };
  }, [calendarMonthAnchor, calendarOpen, refreshCalendarPanel]);

  useEffect(() => {
    let cancelled = false;

    if (!supabase || !viewer.id) {
      const frame = window.requestAnimationFrame(() => {
        if (!cancelled) {
          setMultiplayerPlayers([]);
        }
      });

      return () => {
        cancelled = true;
        window.cancelAnimationFrame(frame);
      };
    }

    const bootstrap = async () => {
      try {
        await upsertUserProfile({
          supabase,
          userId: viewer.id as string,
          displayName: viewer.name,
          email: viewer.email,
        });

        if (!cancelled) {
          await refreshMultiplayerPlayers();
        }
      } catch (error) {
        console.error("[Verge] Failed to bootstrap multiplayer profile:", error);
      }
    };

    const frame = window.requestAnimationFrame(() => {
      void bootstrap();
    });

    const channel = supabase
      .channel("verge-live-leaderboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "player_live_status" }, (payload) => {
        const eventType = payload.eventType;
        if (eventType === "DELETE") {
          const oldRow = payload.old as Partial<PlayerLiveStatusRealtimeRow> | null;
          setMultiplayerPlayers((currentPlayers) => removeRealtimePlayer(currentPlayers, oldRow?.user_id));
          return;
        }

        const nextRow = payload.new as PlayerLiveStatusRealtimeRow | null;
        if (!nextRow) {
          void refreshMultiplayerPlayers();
          return;
        }

        setMultiplayerPlayers((currentPlayers) => mergeRealtimePlayer(currentPlayers, nextRow));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_profiles" }, (payload) => {
        const eventType = payload.eventType;
        if (eventType === "DELETE") {
          const oldRow = payload.old as Partial<UserProfileRealtimeRow> | null;
          setMultiplayerPlayers((currentPlayers) => removeRealtimePlayer(currentPlayers, oldRow?.user_id));
          return;
        }

        const nextRow = payload.new as UserProfileRealtimeRow | null;
        if (!nextRow) {
          void refreshMultiplayerPlayers();
          return;
        }

        setMultiplayerPlayers((currentPlayers) => mergeRealtimeProfile(currentPlayers, nextRow));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void refreshMultiplayerPlayers();
        }
      });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      void supabase.removeChannel(channel);
    };
  }, [refreshMultiplayerPlayers, supabase, viewer.email, viewer.id, viewer.name]);

  useEffect(() => {
    if (!supabase || !viewer.id) {
      return;
    }

    const publishElapsedSeconds = Math.max(0, Math.floor(currentTrackedElapsedSeconds));
    const timeout = window.setTimeout(() => {
      void publishPlayerLiveStatus({
        supabase,
        userId: viewer.id as string,
        totalEarnedPoints: adjustedAccountScoreboard.totalEarnedPoints,
        totalAvailablePoints: adjustedAccountScoreboard.totalAvailablePoints,
        sessionEarnedPoints: adjustedScoreboard.totalEarnedPoints,
        sessionAvailablePoints: adjustedScoreboard.totalAvailablePoints,
        currentTaskTitle: currentBlock?.title || null,
        currentElapsedSeconds: publishElapsedSeconds,
        isTimerRunning: timerRunning,
        lockInMode: lockInModeEnabled,
      }).catch((error) => {
        console.error("[Verge] Failed to publish live leaderboard status:", error);
      });
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    adjustedAccountScoreboard.totalAvailablePoints,
    adjustedAccountScoreboard.totalEarnedPoints,
    adjustedScoreboard.totalAvailablePoints,
    adjustedScoreboard.totalEarnedPoints,
    currentBlock?.title,
    currentTrackedElapsedSeconds,
    lockInModeEnabled,
    supabase,
    timerRunning,
    viewer.id,
  ]);

  useEffect(() => {
    if (!supabase || !viewer.id) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshMultiplayerPlayers();
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshMultiplayerPlayers, supabase, viewer.id]);

  useEffect(() => {
    if (!timerRunning || !currentTimerKey || timerBlockKey !== currentTimerKey) {
      return;
    }

    const interval = window.setInterval(() => {
      let didFinish = false;
      setTimerRemainingSeconds((currentValue) => {
        if (currentValue <= 1) {
          didFinish = true;
          return 0;
        }

        return currentValue - 1;
      });
      setBlockElapsedSeconds((currentValue) => {
        const existing = currentValue[currentTimerKey] || 0;
        const maxDurationSeconds = Math.max(0, (currentBlock?.duration_minutes || 0) * 60);
        return {
          ...currentValue,
          [currentTimerKey]: Math.min(maxDurationSeconds, existing + 1),
        };
      });

      if (didFinish) {
        window.clearInterval(interval);
        setTimerRunning(false);
        if (alertedTimerBlockKeyRef.current !== currentTimerKey) {
          alertedTimerBlockKeyRef.current = currentTimerKey;
          setTimerAlert({
            blockKey: currentTimerKey,
            title: currentBlock?.title || "Current task",
          });
          void notifyTimerComplete(currentBlock?.title || "Current task");
        }
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [currentBlock?.duration_minutes, currentBlock?.title, currentTimerKey, timerBlockKey, timerRunning]);

  useEffect(() => {
    if (!useNativeDesktopDictation) {
      return;
    }

    function clearDictationRestart() {
      if (restartDictationTimerRef.current) {
        window.clearTimeout(restartDictationTimerRef.current);
        restartDictationTimerRef.current = null;
      }
    }

    function restartDesktopDictation() {
      if (!keepDictationAliveRef.current) {
        return;
      }

      clearDictationRestart();
      restartDictationTimerRef.current = window.setTimeout(() => {
        if (!keepDictationAliveRef.current) {
          return;
        }

        void window.electron?.dictation?.start?.({ language: navigator.language || "en-US" });
      }, 220);
    }

    let cancelled = false;
    window.electron?.dictation?.getState?.().then((snapshot) => {
      if (!cancelled && snapshot) {
        setDesktopDictationSupported(Boolean(snapshot.platformSupported));
        setIsListening(Boolean(snapshot.running));
      }
    });

    const unsubscribe = window.electron?.dictation?.onEvent?.((event) => {
      if (cancelled || !event) {
        return;
      }

      const eventSessionId = typeof event.sessionId === "number" ? event.sessionId : null;

      if (event.type === "start") {
        activeDesktopSessionIdRef.current = eventSessionId;
      } else if (
        eventSessionId !== null &&
        activeDesktopSessionIdRef.current !== null &&
        eventSessionId !== activeDesktopSessionIdRef.current
      ) {
        return;
      }

      if (event.type === "start") {
        clearDictationRestart();
        setSpeechError(null);
        setIsListening(true);
        return;
      }

      if (event.type === "transcript") {
        const nextTranscript = event.text?.trim() || "";
        if (!nextTranscript) {
          return;
        }

        if (event.isFinal) {
          dictatedTextRef.current = mergeTranscriptSnapshot(dictatedTextRef.current, nextTranscript);
          dictationInterimRef.current = "";
          setInput(mergeDraftText(dictationBaseRef.current, "", dictatedTextRef.current));
          return;
        }

        dictationInterimRef.current = nextTranscript;
        setInput(
          mergeDraftText(
            dictationBaseRef.current,
            "",
            buildTranscriptPreview(dictatedTextRef.current, dictationInterimRef.current),
          ),
        );
        return;
      }

      if (event.type === "error") {
        if (
          keepDictationAliveRef.current &&
          event.code === "speech-runtime" &&
          (dictatedTextRef.current.trim() || dictationInterimRef.current.trim())
        ) {
          return;
        }

        setSpeechError(mapDesktopDictationError(event.code, event.message));
        return;
      }

      if (event.type === "end") {
        dictatedTextRef.current = mergeTranscriptSnapshot(dictatedTextRef.current, dictationInterimRef.current);
        const finalDraft = mergeDraftText(dictationBaseRef.current, "", dictatedTextRef.current);
        const shouldSuppressCommit = suppressNextDictationCommitRef.current;
        suppressNextDictationCommitRef.current = false;
        const shouldAutoRestart = keepDictationAliveRef.current && !shouldSuppressCommit;

        if (!shouldSuppressCommit) {
          setInput(finalDraft);
          dictationBaseRef.current = finalDraft;
        }

        dictatedTextRef.current = "";
        dictationInterimRef.current = "";

        if (shouldAutoRestart) {
          setIsListening(true);
          restartDesktopDictation();
          return;
        }

        activeDesktopSessionIdRef.current = null;
        setIsListening(false);
      }
    });

    return () => {
      cancelled = true;
      clearDictationRestart();
      unsubscribe?.();
    };
  }, [useNativeDesktopDictation]);

  useEffect(() => {
    if (useNativeDesktopDictation) {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onstart = () => {
      setSpeechError(null);
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || "";

        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      dictatedTextRef.current = `${dictatedTextRef.current}${finalTranscript}`.trim();
      const sessionTranscript = `${dictatedTextRef.current} ${interimTranscript}`.trim();
      setInput(mergeDraftText(dictationBaseRef.current, "", sessionTranscript));
    };

    recognition.onerror = (event) => {
      setSpeechError(mapBrowserSpeechError(event.error));
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      const finalDraft = mergeDraftText(dictationBaseRef.current, "", dictatedTextRef.current);
      const shouldSuppressCommit = suppressNextDictationCommitRef.current;
      suppressNextDictationCommitRef.current = false;

      if (!shouldSuppressCommit) {
        setInput(finalDraft);
        dictationBaseRef.current = finalDraft;
      }

      dictatedTextRef.current = "";
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [useNativeDesktopDictation]);

  const firstName = viewer.name.split(" ")[0] || viewer.email?.split("@")[0] || "there";

  const startListening = useCallback((options?: { keepAlive?: boolean }) => {
    if (!speechSupported || isLoading) {
      if (!speechSupported) {
        setSpeechError("Voice dictation is not available in this environment.");
      }
      return;
    }

    setSpeechError(null);
    keepDictationAliveRef.current = useNativeDesktopDictation && Boolean(options?.keepAlive);
    suppressNextDictationCommitRef.current = false;
    activeDesktopSessionIdRef.current = null;
    dictationBaseRef.current = input;
    dictatedTextRef.current = "";
    dictationInterimRef.current = "";

    if (useNativeDesktopDictation) {
      void window.electron?.dictation?.start?.({ language: navigator.language || "en-US" });
      return;
    }

    try {
      recognitionRef.current?.start();
    } catch {
      setSpeechError("Voice dictation could not start cleanly. Try again.");
    }
  }, [input, isLoading, speechSupported, useNativeDesktopDictation]);

  const stopListening = useCallback((options?: { preserveDraft?: boolean }) => {
    keepDictationAliveRef.current = false;
    suppressNextDictationCommitRef.current = options?.preserveDraft === false;

    if (restartDictationTimerRef.current) {
      window.clearTimeout(restartDictationTimerRef.current);
      restartDictationTimerRef.current = null;
    }

    if (useNativeDesktopDictation) {
      void window.electron?.dictation?.stop?.();
      return;
    }

    recognitionRef.current?.stop();
  }, [useNativeDesktopDictation]);

  function toggleListening() {
    if (isListening) {
      stopListening({ preserveDraft: true });
      return;
    }

    startListening({ keepAlive: useNativeDesktopDictation });
  }

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== PUSH_TO_TALK_KEY || event.repeat || pushToTalkActiveRef.current || isLoading || !speechSupported) {
        return;
      }

      pushToTalkActiveRef.current = true;
      event.preventDefault();
      startListening({ keepAlive: true });
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key !== PUSH_TO_TALK_KEY || !pushToTalkActiveRef.current) {
        return;
      }

      pushToTalkActiveRef.current = false;
      event.preventDefault();

      if (isListening) {
        stopListening({ preserveDraft: true });
      }
    }

    function handleBlur() {
      if (!pushToTalkActiveRef.current) {
        return;
      }

      pushToTalkActiveRef.current = false;
      if (isListening) {
        stopListening({ preserveDraft: true });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [isDesktop, isListening, isLoading, speechSupported, startListening, stopListening, useNativeDesktopDictation]);

  useEffect(() => {
    if (!generatedPlan || !latestProfile || !supabase || !viewer.id) {
      return;
    }

    if (
      persistedPlanKey === generatedPlan.plan_id ||
      persistErrorPlanKey === generatedPlan.plan_id ||
      persistRequestPlanKeyRef.current === generatedPlan.plan_id
    ) {
      return;
    }

    let cancelled = false;
    persistRequestPlanKeyRef.current = generatedPlan.plan_id;
    void saveExecutionPlan({
      supabase,
      userId: viewer.id,
      providerLabel: liveModelLabel,
      profile: latestProfile,
      sourcePrompt: lastUserPromptRef.current,
    })
      .then(({ runId }) => {
        if (cancelled) {
          return;
        }

        setPersistedRunState({
          planKey: generatedPlan.plan_id,
          runId,
        });
        setPersistedPlanKey(generatedPlan.plan_id);
        setPersistErrorPlanKey((currentValue) => (currentValue === generatedPlan.plan_id ? null : currentValue));
        void refreshPlannerHistory();
      })
      .catch((error) => {
        console.error("[Verge] Failed to save execution plan:", error);
        if (!cancelled) {
          setPersistErrorPlanKey(generatedPlan.plan_id);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    generatedPlan,
    latestProfile,
    liveModelLabel,
    persistErrorPlanKey,
    persistedPlanKey,
    refreshPlannerHistory,
    supabase,
    viewer.id,
  ]);

  const handleUpdateBlockStatus = useCallback(
    (blockId: string, status: "pending" | "completed" | "skipped") => {
      if (!executionPlan || !activePlanKey) {
        return;
      }

      setPlanStatusOverrides((currentOverrides) => ({
        ...currentOverrides,
        [`${activePlanKey}:${blockId}`]: status,
      }));

      setPlannerHistory((currentRuns) =>
        currentRuns.map((run) =>
          run.id !== activeRunId
            ? run
            : {
                ...run,
                blocks: run.blocks.map((block) => (block.id === blockId ? { ...block, status } : block)),
              },
        ),
      );

      if (currentBlock?.id === blockId) {
        setTimerRunning(false);
        if (activePlanKey) {
          const currentBlockKey = `${activePlanKey}:${blockId}`;
          setTimerAlert((currentValue) => (currentValue?.blockKey === currentBlockKey ? null : currentValue));
          alertedTimerBlockKeyRef.current = null;
        }
      }

      const blockKey = activePlanKey ? `${activePlanKey}:${blockId}` : null;
      const targetBlock = executionPlan.blocks.find((block) => block.id === blockId);
      const trackedElapsed = blockKey
        ? Math.max(
            0,
            blockElapsedSeconds[blockKey] ??
              targetBlock?.tracked_elapsed_seconds ??
              0,
          )
        : 0;
      const earnedEntry = blockKey ? adjustedScoreboard.entries.find((entry) => entry.blockKey === blockKey) : null;
      if (!targetBlock) {
        return;
      }

      void persistBlockProgress({
        runId: activeRunId,
        planKey: activePlanKey,
        block: targetBlock,
        status,
        elapsedSeconds: trackedElapsed,
        earnedPoints: earnedEntry?.earnedPoints || 0,
      });
    },
    [
      activePlanKey,
      activeRunId,
      blockElapsedSeconds,
      currentBlock?.id,
      executionPlan,
      persistBlockProgress,
      adjustedScoreboard.entries,
    ],
  );

  const persistLiveProgress = useCallback(async () => {
    if (!supabase || !activeRunId || !currentBlock || !activePlanKey) {
      return;
    }

    const blockKey = `${activePlanKey}:${currentBlock.id}`;
    const trackedElapsed = Math.max(0, blockElapsedSeconds[blockKey] || 0);
    const earnedEntry = adjustedScoreboard.entries.find((entry) => entry.blockKey === blockKey);

    await persistBlockProgress({
      runId: activeRunId,
      planKey: activePlanKey,
      block: currentBlock,
      status: currentBlock.status,
      elapsedSeconds: trackedElapsed,
      earnedPoints: earnedEntry?.earnedPoints || 0,
      syncLocal: false,
      reportErrors: false,
    });
  }, [activePlanKey, activeRunId, adjustedScoreboard.entries, blockElapsedSeconds, currentBlock, persistBlockProgress, supabase]);

  useEffect(() => {
    if (!timerRunning || !currentTimerKey) {
      return;
    }

    const trackedElapsed = blockElapsedSeconds[currentTimerKey] || 0;
    if (!trackedElapsed || trackedElapsed % 15 !== 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persistLiveProgress();
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [blockElapsedSeconds, currentTimerKey, persistLiveProgress, timerRunning]);

  const handleSelectHistoryRun = useCallback((runId: string) => {
    setSelectedHistoryRunId(runId);
    setShowHistoryPlan(true);
    setTimerRunning(false);
  }, []);

  const handleDeleteHistoryRun = useCallback(
    async (runId: string) => {
      if (!viewer.id) {
        setPlannerHistory((currentRuns) => currentRuns.filter((run) => run.id !== runId));
        setSelectedHistoryRunId((currentValue) => (currentValue === runId ? null : currentValue));
        return;
      }

      setDeletingHistoryRunId(runId);
      const removedRun = plannerHistory.find((run) => run.id === runId) || null;

      setPlannerHistory((currentRuns) => currentRuns.filter((run) => run.id !== runId));
      setSelectedHistoryRunId((currentValue) => (currentValue === runId ? null : currentValue));

      if (selectedHistoryRunId === runId || activeRunId === runId) {
        setShowHistoryPlan(false);
        setTimerRunning(false);
      }

      if (!supabase) {
        setDeletingHistoryRunId(null);
        return;
      }

      try {
        await deletePlannerRun({
          supabase,
          userId: viewer.id,
          runId,
        });
      } catch (error) {
        console.error("[Verge] Failed to delete planner history run:", error);
        if (removedRun) {
          setPlannerHistory((currentRuns) => {
            const nextRuns = [...currentRuns, removedRun];
            nextRuns.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
            return nextRuns;
          });
        }
      } finally {
        setDeletingHistoryRunId(null);
      }
    },
    [activeRunId, plannerHistory, selectedHistoryRunId, supabase, viewer.id],
  );

  const handleReturnToLivePlan = useCallback(() => {
    if (!currentGeneratedPlan) {
      return;
    }

    setShowHistoryPlan(false);
    setTimerRunning(false);
  }, [currentGeneratedPlan]);

  const handleToggleLockInMode = useCallback(() => {
    if (!currentBlock) {
      return;
    }

    if (lockInModeEnabled) {
      clearLockInMonitoring();
      lockInResumeTimerRef.current = false;
      setLockInAlert(null);
      setLockInCameraError(null);
      setLockInDownSeconds(0);
      setLockInEyesAwaySeconds(0);
      setLockInModeEnabled(false);
      setLockInMonitorPhase("off");
      return;
    }

    setLockInAlert(null);
    setLockInCameraError(null);
    setLockInDownSeconds(0);
    setLockInEyesAwaySeconds(0);
    setLockInModeEnabled(true);
    setLockInMonitorPhase(
      lockInPaperMode === "paper_allowed" ? "monitoring" : lockInPaperMode === "computer_only" && timerRunning ? "requesting_camera" : "setup",
    );
  }, [clearLockInMonitoring, currentBlock, lockInModeEnabled, lockInPaperMode, timerRunning]);

  const handleSetLockInPaperMode = useCallback(
    (mode: LockInPaperMode) => {
      setLockInPaperMode(mode);
      setLockInAlert(null);
      setLockInCameraError(null);
      setLockInDownSeconds(0);
      setLockInEyesAwaySeconds(0);
      lockInDownSinceRef.current = null;
      lockInEyesAwaySinceRef.current = null;
      lockInBaselineRef.current = createEmptyLockInBaseline();

      if (mode === "paper_allowed") {
        clearLockInMonitoring();
        setLockInMonitorPhase("monitoring");
        return;
      }

      setLockInMonitorPhase(timerRunning ? "requesting_camera" : "setup");
    },
    [clearLockInMonitoring, timerRunning],
  );

  const handleStartTimer = useCallback(() => {
    if (!currentBlock) {
      return;
    }

    if (currentTimerKey) {
      setTimerAlert((currentValue) => (currentValue?.blockKey === currentTimerKey ? null : currentValue));
      alertedTimerBlockKeyRef.current = null;
    }
    setTimerBlockKey(currentTimerKey);
    const durationSeconds = Math.max(0, currentBlock.duration_minutes * 60);
    const trackedElapsed = currentTimerKey ? Math.max(0, blockElapsedSeconds[currentTimerKey] || 0) : 0;
    if (!currentTimerKey || timerBlockKey !== currentTimerKey || timerRemainingSeconds <= 0) {
      setTimerRemainingSeconds(Math.max(0, durationSeconds - trackedElapsed));
    }
    setTimerRunning(true);
  }, [blockElapsedSeconds, currentBlock, currentTimerKey, timerBlockKey, timerRemainingSeconds]);

  const handlePauseTimer = useCallback(() => {
    setTimerRunning(false);
    void persistLiveProgress();
  }, [persistLiveProgress]);

  const handleResetTimer = useCallback(() => {
    if (!currentBlock || !currentTimerKey || !activePlanKey) {
      setTimerRunning(false);
      return;
    }

    setTimerRunning(false);
    setTimerAlert((currentValue) => (currentValue?.blockKey === currentTimerKey ? null : currentValue));
    alertedTimerBlockKeyRef.current = null;
    setTimerBlockKey(currentTimerKey);
    setTimerRemainingSeconds(Math.max(0, (currentBlock?.duration_minutes || 0) * 60));
    setBlockElapsedSeconds((currentValue) => ({
      ...currentValue,
      [currentTimerKey]: 0,
    }));

    void persistBlockProgress({
      runId: activeRunId,
      planKey: activePlanKey,
      block: currentBlock,
      status: currentBlock.status,
      elapsedSeconds: 0,
      earnedPoints: 0,
      reportErrors: false,
    });
  }, [activePlanKey, activeRunId, currentBlock, currentTimerKey, persistBlockProgress]);

  const clearComposerDraft = useCallback(() => {
    setInput("");
    dictationBaseRef.current = "";
    dictatedTextRef.current = "";
    dictationInterimRef.current = "";

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  async function handleImportCurrentPlanToCalendar() {
    if (!fullExecutionPlan) {
      return;
    }

    setCalendarImporting(true);
    try {
      await importPlanToCalendar({
        supabase,
        userId: viewer.id,
        plan: fullExecutionPlan,
      });
      setCalendarStatus("Current plan added to Calendar.");
      await refreshCalendarPanel();
    } finally {
      setCalendarImporting(false);
    }
  }

  async function handleConnectGoogleCalendar() {
    const accessToken = await getViewerAccessToken();
    if (!accessToken) {
      setCalendarStatus("Sign in first to connect Google Calendar.");
      return;
    }

    setCalendarStatus(null);
    setGoogleCalendarLoading(true);
    try {
      const { authUrl } = await getGoogleCalendarAuthUrl(accessToken);
      window.open(authUrl, "_blank", "noopener,noreferrer");
      setCalendarStatus("Google sign-in opened in a new tab. Finish the connection there, then hit Refresh.");
    } catch (error) {
      console.error("[Verge] Failed to start Google Calendar auth:", error);
      setCalendarStatus("Google Calendar connection could not start. Check the hosted backend env vars and try again.");
    } finally {
      setGoogleCalendarLoading(false);
    }
  }

  async function handleSyncCurrentPlanToGoogleCalendar() {
    if (!fullExecutionPlan) {
      setCalendarStatus("Create a plan first, then sync it to Google Calendar.");
      return;
    }

    const accessToken = await getViewerAccessToken();
    if (!accessToken) {
      setCalendarStatus("Sign in first to sync with Google Calendar.");
      return;
    }

    const events = buildCalendarEventsFromPlan(fullExecutionPlan);
    if (!events.length) {
      setCalendarStatus("There are no calendar blocks to sync for this plan yet.");
      return;
    }

    setGoogleCalendarSyncing(true);
    setCalendarStatus(null);
    try {
      const result = await syncGoogleCalendarEvents({
        accessToken,
        events,
        planKey: fullExecutionPlan.plan_id,
        timeZone:
          fullExecutionPlan.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago",
      });

      setCalendarStatus(`Synced ${result.syncedCount} events to Google Calendar.`);
      await refreshCalendarPanel();
    } catch (error) {
      console.error("[Verge] Failed to sync Google Calendar events:", error);
      setCalendarStatus("Google Calendar sync failed. If this is your first time, connect Google first and try again.");
    } finally {
      setGoogleCalendarSyncing(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || isLoading) {
      return;
    }

    if (isListening) {
      stopListening({ preserveDraft: false });
    }

    const text = input.trim();
    setLastRequestWantedCalendar(Boolean(buildCalendarIntentContext(text)));
    const historyContext = buildPlannerHistoryContext({
      runs: plannerHistory,
      userText: text,
      selectedRunId: showHistoryPlan ? selectedHistoryRunId : null,
    });
    lastUserPromptRef.current = text;
    clearComposerDraft();
    setHasStarted(true);
    setShowHistoryPlan(false);
    setTimerAlert(null);
    setSpeechError(null);

    try {
      await sendMessage(text, {
        historyContext,
        preferenceContext,
      });
    } finally {
      clearComposerDraft();
    }
  }

  async function handleStarter(text: string) {
    if (isListening) {
      stopListening({ preserveDraft: false });
    }

    setLastRequestWantedCalendar(Boolean(buildCalendarIntentContext(text)));
    lastUserPromptRef.current = text;
    setHasStarted(true);
    setShowHistoryPlan(false);
    setTimerAlert(null);
    setSpeechError(null);
    await sendMessage(text, {
      historyContext: buildPlannerHistoryContext({
        runs: plannerHistory,
        userText: text,
        selectedRunId: showHistoryPlan ? selectedHistoryRunId : null,
      }),
      preferenceContext,
    });
  }

  async function handleReset() {
    if (isListening) {
      stopListening({ preserveDraft: false });
    }

    await persistLiveProgress();

    resetConversation();
    setHasStarted(false);
    clearComposerDraft();
    setSpeechError(null);
    lastUserPromptRef.current = "";
    persistRequestPlanKeyRef.current = null;
    setPersistedPlanKey(null);
    setPersistErrorPlanKey(null);
    setPersistedRunState(null);
    setPlanStatusOverrides({});
    setPlanProgressOverrides({});
    setPreferencesOpen(false);
    setCalendarOpen(false);
    setCalendarStatus(null);
    setLastRequestWantedCalendar(false);
    setSelectedHistoryRunId(null);
    setShowHistoryPlan(false);
    setTimerRunning(false);
    setTimerRemainingSeconds(0);
    setTimerBlockKey(null);
    setBlockElapsedSeconds({});
    setTimerAlert(null);
    lockInResumeTimerRef.current = false;
    clearLockInMonitoring();
    setLockInModeEnabled(false);
    setLockInPaperMode(null);
    setLockInMonitorPhase("off");
    setLockInCameraError(null);
    setLockInWarningCount(0);
    setLockInDownSeconds(0);
    setLockInAlert(null);
    alertedTimerBlockKeyRef.current = null;
  }

  function openPreferences() {
    setPreferenceDraft(preferences);
    setPreferencesOpen(true);
  }

  function openCalendar() {
    setCalendarStatus(null);
    setCalendarOpen(true);
    void refreshCalendarPanel();
  }

  async function handleSavePreferences() {
    setPreferencesSaving(true);
    try {
      const saved = await saveUserPreferences({
        supabase,
        userId: viewer.id,
        preferences: preferenceDraft,
      });
      setPreferences(saved);
      setPreferenceDraft(saved);
      setPreferencesOpen(false);
    } finally {
      setPreferencesSaving(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    if (isListening) {
      stopListening({ preserveDraft: false });
    }

    setInput(event.target.value);
    dictationBaseRef.current = event.target.value;
    setSpeechError(null);
  }

  const compactContent = currentBlock ? (
    <div className="flex min-w-0 items-center gap-3 overflow-hidden">
      <div className="min-w-0 flex flex-1 items-center gap-2 overflow-hidden">
        <span className="rounded-full border border-orange-300/20 bg-orange-300/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-orange-100">
          {activePlanSource === "history" ? "history" : "active"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-white/88">{currentBlock.title}</p>
          <p className="truncate text-[10px] text-white/45">
            {formatLockInPoints(adjustedScoreboard.currentEarnedPoints)}/{formatLockInPoints(adjustedScoreboard.currentTargetPoints)} pts earned
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full border border-orange-300/20 bg-orange-300/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-orange-100">
          {formatLockInPoints(adjustedScoreboard.currentEarnedPoints)}/{formatLockInPoints(adjustedScoreboard.currentTargetPoints)} pts
        </span>
        <div className="rounded-[16px] border border-white/12 bg-white/10 px-3 py-1.5 text-center shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-white/45">Timer</p>
          <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-white">{timerLabel}</p>
        </div>
      </div>
    </div>
  ) : adjustedAccountScoreboard.totalEarnedPoints > 0 ? (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
      <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
        {formatLockInPoints(adjustedAccountScoreboard.totalEarnedPoints)} pts
      </span>
      <p className="truncate text-[11px] text-white/72">Account points saved so far</p>
    </div>
  ) : null;

  return (
    <DesktopShell
      badge={mode === "live" ? "Kai Live" : "Kai Preview"}
      title={mode === "live" ? "Verge desktop planner" : "Verge preview mode"}
      subtitle={
        mode === "live"
          ? "Talk through the week and Kai will shape a schedule inside the desktop shell."
          : "A live model provider is not configured, so Kai uses a safe fallback instead of breaking."
      }
      compactContent={compactContent}
      contentClassName="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,0.82fr)_400px] xl:grid-cols-[minmax(0,0.74fr)_500px]"
      actions={
        <>
          <button
            onClick={openCalendar}
            className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
            type="button"
          >
            Calendar
          </button>
          <button
            onClick={openPreferences}
            className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
            type="button"
          >
            Preferences
          </button>
          {hasStarted ? (
            <button
              onClick={handleReset}
              className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              type="button"
            >
              New chat
            </button>
          ) : null}
          {onSignOut ? (
            <button
              onClick={() => void onSignOut()}
              className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              type="button"
            >
              Sign out
            </button>
          ) : null}
        </>
      }
    >
      <video ref={lockInVideoRef} className="hidden" autoPlay muted playsInline aria-hidden="true" />

      {lockInAlert ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-red-950/88 px-4 py-8 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-[28px] border border-red-300/25 bg-[#18070a]/95 px-6 py-7 text-center shadow-[0_32px_120px_rgba(127,29,29,0.55)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-red-100/75">
              {lockInAlert.warningCount === 1
                ? "1st warning"
                : lockInAlert.warningCount === 2
                  ? "2nd warning"
                  : lockInAlert.warningCount === 3
                    ? "3rd warning"
                    : `Warning ${lockInAlert.warningCount}`}
            </p>
            <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white">Lock back in.</h3>
            <p className="mt-4 text-base leading-8 text-red-50/88">
              Verge noticed a long downward look on a computer-only task, which usually means your phone or another distraction pulled you away.
            </p>
            <div className="mt-5 rounded-[22px] border border-red-300/20 bg-red-300/10 px-4 py-4 text-left">
              <p className="text-sm font-semibold text-white">{lockInAlert.title}</p>
              <p className="mt-2 text-sm leading-6 text-red-50/80">
                {lockInAlert.warningCount <= LOCK_IN_PENALTY_AFTER_WARNINGS
                  ? `This is warning ${lockInAlert.warningCount}. After ${LOCK_IN_PENALTY_AFTER_WARNINGS} warnings, each extra warning costs ${formatLockInPoints(LOCK_IN_PENALTY_POINTS)} points.`
                  : `You lost ${formatLockInPoints(lockInAlert.penaltyPoints)} points on the leaderboard for this warning. Total lock-in penalties this session: ${formatLockInPoints(lockInPenaltyPoints)}.`}
              </p>
            </div>
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleDismissLockInAlert}
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-white/90"
                type="button"
              >
                I&apos;ll get back into locking in
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="flex min-h-0 flex-col border-b border-white/8 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 border-b border-white/8 px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/6">
              <KaiLogo size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/90">Kai</p>
              <p className="text-xs text-white/45">
                {viewer.isGuest
                  ? mode === "live"
                    ? "Guest session • live model"
                    : "Guest session • preview fallback"
                  : viewer.email
                    ? `Signed in as ${viewer.email}`
                    : "Signed-in session"}
              </p>
            </div>
          </div>

          <span
            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
              mode === "live"
                ? "border border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                : "border border-amber-300/20 bg-amber-300/10 text-amber-100"
            }`}
          >
            {mode === "live" ? "Live model" : "Preview fallback"}
          </span>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto py-4" style={{ scrollbarWidth: "thin" }}>
          {timerAlert ? (
            <div className="px-4 pb-3 md:px-6">
              <div className="flex items-center justify-between gap-3 rounded-[22px] border border-orange-300/20 bg-orange-300/10 px-4 py-3 text-left">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-100/80">Timer complete</p>
                  <p className="mt-1 text-sm font-medium text-white">{timerAlert.title} is ready for review.</p>
                </div>
                <button
                  onClick={() => setTimerAlert(null)}
                  className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[11px] text-white/80 transition hover:border-white/20 hover:bg-white/12 hover:text-white"
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
          {shouldPromptCalendarImport ? (
            <div className="px-4 pb-3 md:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-sky-300/20 bg-sky-300/10 px-4 py-3 text-left">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100/80">Calendar-ready plan</p>
                  <p className="mt-1 text-sm font-medium text-white">
                    This plan looks better on the calendar. Want Verge to place the full schedule across dates now?
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={openCalendar}
                    className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[11px] text-white/80 transition hover:border-white/20 hover:bg-white/12 hover:text-white"
                    type="button"
                  >
                    View calendar
                  </button>
                  <button
                    onClick={() => void handleImportCurrentPlanToCalendar()}
                    disabled={calendarImporting}
                    className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-900 transition hover:bg-white/90 disabled:cursor-default disabled:opacity-40"
                    type="button"
                  >
                    {calendarImporting ? "Adding…" : "Add to calendar"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {!hasStarted ? (
            <div className="flex h-full flex-col items-center justify-center gap-10 px-6 pb-16 text-center">
              <div className="space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-white/6">
                  <KaiLogo size={22} />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
                  Hey {firstName} — let&apos;s build the week.
                </h2>
                <p className="mx-auto max-w-xl text-sm leading-7 text-white/50 md:text-base">
                  Tell Kai what is fixed, what is urgent, when your energy is best, and what you
                  refuse to sacrifice. The shell is now set up for desktop use instead of a generic
                  webpage in a window.
                </p>
              </div>

              <div className="flex max-w-xl flex-wrap justify-center gap-2.5">
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    onClick={() => void handleStarter(starter)}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/65 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                    type="button"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-0.5 pb-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" ? <TypingIndicator /> : null}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        <footer className="border-t border-white/8 px-4 pb-5 pt-4 md:px-6">
          <div className="flex items-end gap-2 rounded-[22px] border border-white/10 bg-white/[0.05] px-4 py-3 transition focus-within:border-white/20">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={hasStarted ? "Reply to Kai..." : "Tell Kai about your week..."}
              disabled={isLoading}
              className="max-h-[160px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-white/90 outline-none placeholder:text-white/25 disabled:opacity-40"
            />
            {isDesktop && speechSupported ? (
              <span className="mb-0.5 hidden rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55 md:inline-flex">
                Hold {pushToTalkKeyLabel}
              </span>
            ) : null}
            <button
              onClick={toggleListening}
              disabled={isLoading || !speechSupported}
              aria-label={isListening ? "Stop voice dictation" : "Start voice dictation"}
              aria-pressed={isListening}
              className={`mb-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition ${
                isListening
                  ? "bg-orange-300 text-zinc-900 shadow-[0_0_0_8px_rgba(251,191,36,0.08)]"
                  : "border border-white/10 bg-white/[0.06] text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white"
              } disabled:cursor-default disabled:opacity-25`}
              type="button"
            >
              <MicIcon active={isListening} />
            </button>
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || isLoading}
              className="mb-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white text-zinc-900 transition hover:bg-white/90 disabled:cursor-default disabled:opacity-25"
              aria-label="Send"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M7 12V2M7 2L3 6M7 2L11 6"
                  stroke="#18181b"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <p
            className={`mt-3 text-center text-[11px] ${
              speechError ? "text-amber-200/80" : isListening ? "text-orange-100/80" : "text-white/18"
            }`}
          >
            {speechError
              ? speechError
              : isListening
                ? "Listening now. Verge is adding your words into the draft."
                : speechSupported
                  ? `Tap the mic, or hold ${pushToTalkKeyLabel} to record and release to keep the text in the draft. Kai still plans around energy, buffers, and deadlines instead of treating the calendar like a wall of equal blocks.`
                  : "Kai plans around energy, buffers, and deadlines instead of treating the calendar like a wall of equal blocks."}
          </p>
        </footer>
      </section>

      {calendarOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4 py-8 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0e13]/95 shadow-[0_32px_120px_rgba(0,0,0,0.5)]">
            <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/80">Calendar</p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {googleCalendarStatus?.connected ? "Google calendar" : "Connect Google calendar"}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
                  Open your live Google Calendar inside Verge and keep plans, workouts, school, and fixed commitments on real dates.
                </p>
              </div>
              <button
                onClick={() => setCalendarOpen(false)}
                className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                type="button"
              >
                Close
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-white/90">
                  {googleCalendarStatus?.connected
                    ? `${formatCalendarMonthLabel(calendarMonthAnchor)} view`
                    : fullExecutionPlan
                      ? fullExecutionPlan.scope_label
                      : "No Google Calendar connected yet"}
                </p>
                <p className="mt-1 text-xs text-white/45">
                  {googleCalendarStatus?.connected
                    ? "This is the live Google Calendar view inside Verge. Sync a current plan to place Verge-generated blocks onto the calendar."
                    : "Connect Google once, then Verge will show your Google Calendar directly here."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                      googleCalendarStatus?.connected
                        ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                        : "border-white/10 bg-white/6 text-white/55"
                    }`}
                  >
                    {googleCalendarLoading
                      ? "Checking Google…"
                      : googleCalendarStatus?.connected
                        ? `Google connected${googleCalendarStatus.email ? ` · ${googleCalendarStatus.email}` : ""}`
                        : "Google not connected"}
                  </span>
                  {googleCalendarStatus?.calendarId ? (
                    <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                      {googleCalendarStatus.calendarId}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void refreshCalendarPanel(calendarMonthAnchor)}
                  className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  type="button"
                >
                  Refresh
                </button>
                <button
                  onClick={() => void handleConnectGoogleCalendar()}
                  disabled={googleCalendarLoading}
                  className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-300/20 disabled:cursor-default disabled:opacity-40"
                  type="button"
                >
                  {googleCalendarStatus?.connected ? "Reconnect Google" : "Connect Google"}
                </button>
                <button
                  onClick={() => void handleImportCurrentPlanToCalendar()}
                  disabled={!fullExecutionPlan || calendarImporting}
                  className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-white/90 disabled:cursor-default disabled:opacity-40"
                  type="button"
                >
                  {calendarImporting ? "Importing…" : "Add current plan"}
                </button>
                <button
                  onClick={() => void handleSyncCurrentPlanToGoogleCalendar()}
                  disabled={!fullExecutionPlan || googleCalendarSyncing || !googleCalendarStatus?.connected}
                  className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-300/20 disabled:cursor-default disabled:opacity-40"
                  type="button"
                >
                  {googleCalendarSyncing ? "Syncing…" : "Sync to Google"}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5" style={{ scrollbarWidth: "thin" }}>
              {calendarStatus ? (
                <div className="mb-4 rounded-[20px] border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
                  {calendarStatus}
                </div>
              ) : null}

              {calendarLoading ? (
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-5 py-6 text-sm text-white/58">
                  Loading calendar events…
                </div>
              ) : googleCalendarStatus?.connected ? (
                <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
                  <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{formatCalendarMonthLabel(calendarMonthAnchor)}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/40">
                          Live Google calendar inside Verge
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const nextAnchor = new Date(calendarMonthAnchor.getFullYear(), calendarMonthAnchor.getMonth() - 1, 1);
                            setCalendarMonthAnchor(nextAnchor);
                            setSelectedCalendarDate(toIsoCalendarDate(nextAnchor));
                          }}
                          className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                          type="button"
                        >
                          Prev
                        </button>
                        <button
                          onClick={() => {
                            const today = new Date();
                            setCalendarMonthAnchor(today);
                            setSelectedCalendarDate(toIsoCalendarDate(today));
                          }}
                          className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                          type="button"
                        >
                          Today
                        </button>
                        <button
                          onClick={() => {
                            const nextAnchor = new Date(calendarMonthAnchor.getFullYear(), calendarMonthAnchor.getMonth() + 1, 1);
                            setCalendarMonthAnchor(nextAnchor);
                            setSelectedCalendarDate(toIsoCalendarDate(nextAnchor));
                          }}
                          className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                          type="button"
                        >
                          Next
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <div key={day} className="px-2 py-1">
                          {day}
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 grid grid-cols-7 gap-2">
                      {calendarMonthGrid.map((cell) => {
                        const dayEvents = visibleCalendarEvents.filter((event) => event.eventDate === cell.isoDate);
                        const holidayLabel = visibleCalendarHolidayMap.get(cell.isoDate) || null;
                        const isSelected = cell.isoDate === selectedCalendarDate;

                        return (
                          <button
                            key={cell.isoDate}
                            onClick={() => setSelectedCalendarDate(cell.isoDate)}
                            className={`min-h-[122px] rounded-[20px] border p-3 text-left transition ${
                              isSelected
                                ? "border-sky-300/45 bg-sky-300/10"
                                : cell.inCurrentMonth
                                  ? "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                                  : "border-white/6 bg-white/[0.02] text-white/35 hover:border-white/14"
                            }`}
                            type="button"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className={`text-sm font-semibold ${
                                  cell.isToday ? "text-sky-100" : cell.inCurrentMonth ? "text-white" : "text-white/35"
                                }`}
                              >
                                {cell.dayNumber}
                              </span>
                              {cell.isToday ? (
                                <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-100">
                                  Today
                                </span>
                              ) : null}
                            </div>

                            {holidayLabel ? <p className="mt-2 truncate text-[10px] text-yellow-100/85">{holidayLabel}</p> : null}

                            <div className="mt-3 space-y-1.5">
                              {dayEvents.slice(0, 3).map((event) => (
                                <div
                                  key={event.id}
                                  className="truncate rounded-full px-2 py-1 text-[10px] font-medium text-white"
                                  style={{ backgroundColor: event.color }}
                                >
                                  {event.startTime ? `${formatCalendarTimeRange(event.startTime, null)} · ` : ""}
                                  {event.title}
                                </div>
                              ))}
                              {dayEvents.length > 3 ? (
                                <p className="text-[10px] text-white/45">+{dayEvents.length - 3} more</p>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{formatCalendarDateHeading(selectedCalendarDate)}</p>
                        <p className="mt-1 text-[11px] text-white/40">{selectedCalendarDate}</p>
                      </div>
                      {selectedCalendarHoliday ? (
                        <span className="rounded-full border border-yellow-300/20 bg-yellow-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-yellow-100">
                          {selectedCalendarHoliday}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-3">
                      {selectedCalendarEvents.length ? (
                        selectedCalendarEvents.map((event) => (
                          <div key={event.id} className="rounded-[20px] border border-white/10 bg-white/[0.05] p-4">
                            <div className="flex items-start gap-3">
                              <span className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: event.color }} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-white">{event.title}</p>
                                  <span className="rounded-full border border-white/10 bg-white/6 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/55">
                                    {event.kind}
                                  </span>
                                </div>
                                <p className="mt-2 text-xs text-white/45">{formatCalendarTimeRange(event.startTime, event.endTime)}</p>
                                {event.notes ? <p className="mt-2 text-xs leading-5 text-white/55">{event.notes}</p> : null}
                                {event.htmlLink ? (
                                  <a
                                    href={event.htmlLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-3 inline-flex text-xs font-medium text-sky-200 transition hover:text-sky-100"
                                  >
                                    Open in Google Calendar
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm leading-6 text-white/55">
                          No Google Calendar events on this day yet.
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.04] px-6 py-8">
                  <div className="max-w-xl text-center">
                    <p className="text-2xl font-semibold text-white">Connect Google to open your calendar here</p>
                    <p className="mt-3 text-sm leading-6 text-white/58">
                      Once Google Calendar is connected, this modal becomes your live calendar view inside Verge. Then you can sync plans into it without leaving the app.
                    </p>
                    <button
                      onClick={() => void handleConnectGoogleCalendar()}
                      disabled={googleCalendarLoading}
                      className="mt-6 rounded-full border border-sky-300/20 bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-300/20 disabled:cursor-default disabled:opacity-40"
                      type="button"
                    >
                      {googleCalendarStatus?.connected ? "Reconnect Google" : "Connect Google"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {preferencesOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-[#0b0e13]/95 p-5 shadow-[0_32px_120px_rgba(0,0,0,0.5)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-200/80">Preferences</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Give Kai your default planning context</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">
                  Save the basics once so Kai can plan faster and stop re-asking the same setup questions every session.
                </p>
              </div>
              <button
                onClick={() => setPreferencesOpen(false)}
                className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Optimal focus time</p>
                <input
                  type="number"
                  min={15}
                  max={180}
                  step={5}
                  value={preferenceDraft.focusMinutes ?? ""}
                  onChange={(event) =>
                    setPreferenceDraft((currentValue) => ({
                      ...currentValue,
                      focusMinutes: event.target.value ? Number(event.target.value) : null,
                    }))
                  }
                  className="mt-3 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
                  placeholder="90"
                />
              </label>

              <label className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Wake time</p>
                <input
                  type="time"
                  value={preferenceDraft.wakeTime ?? ""}
                  onChange={(event) =>
                    setPreferenceDraft((currentValue) => ({
                      ...currentValue,
                      wakeTime: event.target.value || null,
                    }))
                  }
                  className="mt-3 w-full bg-transparent text-sm text-white outline-none"
                />
              </label>

              <label className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Sleep time</p>
                <input
                  type="time"
                  value={preferenceDraft.sleepTime ?? ""}
                  onChange={(event) =>
                    setPreferenceDraft((currentValue) => ({
                      ...currentValue,
                      sleepTime: event.target.value || null,
                    }))
                  }
                  className="mt-3 w-full bg-transparent text-sm text-white outline-none"
                />
              </label>

              <label className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Best focus window</p>
                <select
                  value={preferenceDraft.peakFocus}
                  onChange={(event) =>
                    setPreferenceDraft((currentValue) => ({
                      ...currentValue,
                      peakFocus: event.target.value as UserPreferences["peakFocus"],
                    }))
                  }
                  className="mt-3 w-full bg-transparent text-sm text-white outline-none"
                >
                  {PREFERENCE_PEAK_OPTIONS.map((option) => (
                    <option key={option} value={option} className="bg-zinc-900 text-white">
                      {option === "unknown" ? "No default" : option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 md:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Low-energy window</p>
                <select
                  value={preferenceDraft.lowEnergy}
                  onChange={(event) =>
                    setPreferenceDraft((currentValue) => ({
                      ...currentValue,
                      lowEnergy: event.target.value as UserPreferences["lowEnergy"],
                    }))
                  }
                  className="mt-3 w-full bg-transparent text-sm text-white outline-none"
                >
                  {PREFERENCE_LOW_ENERGY_OPTIONS.map((option) => (
                    <option key={option} value={option} className="bg-zinc-900 text-white">
                      {option === "unknown" ? "No default" : option}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Weekday school hours</p>
                    <p className="mt-2 text-sm leading-6 text-white/55">
                      Kai will treat school as a fixed Monday–Friday commitment and avoid scheduling in-app work inside that window.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={preferenceDraft.schoolEnabled}
                      onChange={(event) =>
                        setPreferenceDraft((currentValue) => ({
                          ...currentValue,
                          schoolEnabled: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-white/20 bg-transparent"
                    />
                    Enable
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">School starts</p>
                    <input
                      type="time"
                      value={preferenceDraft.schoolStartTime ?? ""}
                      disabled={!preferenceDraft.schoolEnabled}
                      onChange={(event) =>
                        setPreferenceDraft((currentValue) => ({
                          ...currentValue,
                          schoolStartTime: event.target.value || null,
                        }))
                      }
                      className="mt-3 w-full bg-transparent text-sm text-white outline-none disabled:opacity-40"
                    />
                  </label>
                  <label>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">School ends</p>
                    <input
                      type="time"
                      value={preferenceDraft.schoolEndTime ?? ""}
                      disabled={!preferenceDraft.schoolEnabled}
                      onChange={(event) =>
                        setPreferenceDraft((currentValue) => ({
                          ...currentValue,
                          schoolEndTime: event.target.value || null,
                        }))
                      }
                      className="mt-3 w-full bg-transparent text-sm text-white outline-none disabled:opacity-40"
                    />
                  </label>
                </div>
              </div>

              <label className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 md:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">General planning notes</p>
                <textarea
                  rows={4}
                  value={preferenceDraft.notes}
                  onChange={(event) =>
                    setPreferenceDraft((currentValue) => ({
                      ...currentValue,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Examples: I prefer deep work before noon, keep Friday nights light, I need dinner around 7."
                  className="mt-3 w-full resize-none bg-transparent text-sm leading-6 text-white outline-none placeholder:text-white/25"
                />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-xs text-white/45">
                {preferencesLoading ? "Loading saved preferences…" : "Kai will automatically use these preferences in future scheduling chats."}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setPreferenceDraft(preferences);
                    setPreferencesOpen(false);
                  }}
                  className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSavePreferences()}
                  disabled={preferencesSaving}
                  className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-white/90 disabled:cursor-default disabled:opacity-40"
                  type="button"
                >
                  {preferencesSaving ? "Saving…" : "Save preferences"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ExecutionRail
        liveModelLabel={liveModelLabel}
        plan={executionPlan}
        profile={activeProfile}
        taskFlowMessage={taskFlowMessage}
        storageState={storageState}
        historyRuns={plannerHistory}
        selectedHistoryRunId={selectedHistoryRunId}
        historyLoading={historyLoading}
        timerLabel={timerLabel}
        timerRunning={timerRunning}
        timerProgressPercent={timerProgressPercent}
        activeRunSource={activePlanSource}
        lockInModeEnabled={lockInModeEnabled}
        lockInPaperMode={lockInPaperMode}
        lockInMonitorPhase={lockInMonitorPhase}
        lockInCameraError={lockInCameraError}
        lockInWarningCount={lockInWarningCount}
        lockInPenaltyPoints={lockInPenaltyPoints}
        lockInDownSeconds={lockInDownSeconds}
        lockInEyesAwaySeconds={lockInEyesAwaySeconds}
        lockInAlertActive={Boolean(lockInAlert)}
        lockInPointsMultiplier={lockInPointsMultiplier}
        onUpdateBlockStatus={handleUpdateBlockStatus}
        onStartTimer={handleStartTimer}
        onPauseTimer={handlePauseTimer}
        onResetTimer={handleResetTimer}
        onToggleLockInMode={handleToggleLockInMode}
        onSetLockInPaperMode={handleSetLockInPaperMode}
        onSelectHistoryRun={handleSelectHistoryRun}
        onDeleteHistoryRun={handleDeleteHistoryRun}
        onReturnToLivePlan={handleReturnToLivePlan}
        canReturnToLivePlan={Boolean(currentGeneratedPlan)}
        leaderboardName={viewer.isGuest ? "You" : viewer.name}
        scoreboard={adjustedAccountScoreboard}
        multiplayerPlayers={multiplayerPlayers}
        multiplayerLoading={multiplayerLoading}
        viewerId={viewer.id}
        deletingHistoryRunId={deletingHistoryRunId}
        protectedHistoryRunId={activeRunId}
      />
    </DesktopShell>
  );
}
