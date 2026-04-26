"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import ExecutionRail from "@/components/kai/ExecutionRail";
import DesktopShell from "@/components/layout/DesktopShell";
import type { KaiExecutionBlock } from "@/lib/kai-prompt";
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
import { buildAccountScoreboard, buildScoreboardSummary } from "@/lib/scoreboard";
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

const STARTERS = [
  "Build my schedule from scratch",
  "I have a deadline coming up",
  "My week is a mess — help",
  "I'm a morning person, optimize for that",
];

const PUSH_TO_TALK_KEY = "Alt";

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
  const isDesktop = useSyncExternalStore(subscribeToDesktopBridge, getDesktopSnapshot, () => false);
  const browserSpeechSupported = useSyncExternalStore(subscribeToSpeechSupport, getSpeechSupportSnapshot, () => false);
  const speechSupported = isDesktop ? desktopDictationSupported : browserSpeechSupported;
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
  const executionPlan =
    activePlanSource === "history" ? historyPlan : activePlanSource === "live" ? currentGeneratedPlan : null;
  const activeProfile = activePlanSource === "history" ? activeHistoryRun?.rawProfile ?? latestProfile : latestProfile;
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
        historyRuns: plannerHistory,
        activePlan: executionPlan,
        activeRunId,
        elapsedSecondsByBlock: blockElapsedSeconds,
        currentBlockKey: currentTimerKey,
      }),
    [activeRunId, blockElapsedSeconds, currentTimerKey, executionPlan, plannerHistory],
  );

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
    if (!timerRunning || !currentTimerKey || timerBlockKey !== currentTimerKey) {
      return;
    }

    const interval = window.setInterval(() => {
      setTimerRemainingSeconds((currentValue) => {
        if (currentValue <= 1) {
          window.clearInterval(interval);
          setTimerRunning(false);
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
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [currentBlock?.duration_minutes, currentTimerKey, timerBlockKey, timerRunning]);

  useEffect(() => {
    if (!isDesktop) {
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
        if (keepDictationAliveRef.current && event.code === "speech-runtime") {
          setSpeechError(null);
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
  }, [isDesktop]);

  useEffect(() => {
    if (isDesktop) {
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
  }, [isDesktop]);

  const firstName = viewer.name.split(" ")[0] || viewer.email?.split("@")[0] || "there";

  const startListening = useCallback((options?: { keepAlive?: boolean }) => {
    if (!speechSupported || isLoading) {
      if (!speechSupported) {
        setSpeechError("Voice dictation is not available in this environment.");
      }
      return;
    }

    setSpeechError(null);
    keepDictationAliveRef.current = isDesktop && Boolean(options?.keepAlive);
    suppressNextDictationCommitRef.current = false;
    activeDesktopSessionIdRef.current = null;
    dictationBaseRef.current = input;
    dictatedTextRef.current = "";
    dictationInterimRef.current = "";

    if (isDesktop) {
      void window.electron?.dictation?.start?.({ language: navigator.language || "en-US" });
      return;
    }

    try {
      recognitionRef.current?.start();
    } catch {
      setSpeechError("Voice dictation could not start cleanly. Try again.");
    }
  }, [input, isDesktop, isLoading, speechSupported]);

  const stopListening = useCallback((options?: { preserveDraft?: boolean }) => {
    keepDictationAliveRef.current = false;
    suppressNextDictationCommitRef.current = options?.preserveDraft === false;

    if (restartDictationTimerRef.current) {
      window.clearTimeout(restartDictationTimerRef.current);
      restartDictationTimerRef.current = null;
    }

    if (isDesktop) {
      void window.electron?.dictation?.stop?.();
      return;
    }

    recognitionRef.current?.stop();
  }, [isDesktop]);

  function toggleListening() {
    if (isListening) {
      stopListening({ preserveDraft: true });
      return;
    }

    startListening({ keepAlive: isDesktop });
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
  }, [isDesktop, isListening, isLoading, speechSupported, startListening, stopListening]);

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
      const earnedEntry = blockKey ? scoreboard.entries.find((entry) => entry.blockKey === blockKey) : null;
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
      scoreboard.entries,
    ],
  );

  const persistLiveProgress = useCallback(async () => {
    if (!supabase || !activeRunId || !currentBlock || !activePlanKey) {
      return;
    }

    const blockKey = `${activePlanKey}:${currentBlock.id}`;
    const trackedElapsed = Math.max(0, blockElapsedSeconds[blockKey] || 0);
    const earnedEntry = scoreboard.entries.find((entry) => entry.blockKey === blockKey);

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
  }, [activePlanKey, activeRunId, blockElapsedSeconds, currentBlock, persistBlockProgress, scoreboard.entries, supabase]);

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

  const handleStartTimer = useCallback(() => {
    if (!currentBlock) {
      return;
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

  async function handleSend() {
    if (!input.trim() || isLoading) {
      return;
    }

    if (isListening) {
      stopListening({ preserveDraft: false });
    }

    const text = input.trim();
    const historyContext = buildPlannerHistoryContext({
      runs: plannerHistory,
      userText: text,
      selectedRunId: showHistoryPlan ? selectedHistoryRunId : null,
    });
    lastUserPromptRef.current = text;
    setInput("");
    setHasStarted(true);
    setShowHistoryPlan(false);
    setSpeechError(null);
    dictationBaseRef.current = "";
    dictatedTextRef.current = "";
    dictationInterimRef.current = "";
    await sendMessage(text, { historyContext });
  }

  async function handleStarter(text: string) {
    if (isListening) {
      stopListening({ preserveDraft: false });
    }

    lastUserPromptRef.current = text;
    setHasStarted(true);
    setShowHistoryPlan(false);
    setSpeechError(null);
    await sendMessage(text, {
      historyContext: buildPlannerHistoryContext({
        runs: plannerHistory,
        userText: text,
        selectedRunId: showHistoryPlan ? selectedHistoryRunId : null,
      }),
    });
  }

  async function handleReset() {
    if (isListening) {
      stopListening({ preserveDraft: false });
    }

    await persistLiveProgress();

    resetConversation();
    setHasStarted(false);
    setInput("");
    setSpeechError(null);
    dictatedTextRef.current = "";
    dictationInterimRef.current = "";
    dictationBaseRef.current = "";
    lastUserPromptRef.current = "";
    persistRequestPlanKeyRef.current = null;
    setPersistedPlanKey(null);
    setPersistErrorPlanKey(null);
    setPersistedRunState(null);
    setPlanStatusOverrides({});
    setPlanProgressOverrides({});
    setSelectedHistoryRunId(null);
    setShowHistoryPlan(false);
    setTimerRunning(false);
    setTimerRemainingSeconds(0);
    setTimerBlockKey(null);
    setBlockElapsedSeconds({});
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
            {scoreboard.currentEarnedPoints}/{scoreboard.currentTargetPoints} pts earned
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full border border-orange-300/20 bg-orange-300/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-orange-100">
          {scoreboard.currentEarnedPoints}/{scoreboard.currentTargetPoints} pts
        </span>
        <div className="rounded-[16px] border border-white/12 bg-white/10 px-3 py-1.5 text-center shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-white/45">Timer</p>
          <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-white">{timerLabel}</p>
        </div>
      </div>
    </div>
  ) : accountScoreboard.totalEarnedPoints > 0 ? (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
      <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
        {accountScoreboard.totalEarnedPoints} pts
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
      contentClassName="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,0.88fr)_360px] xl:grid-cols-[minmax(0,0.8fr)_430px]"
      actions={
        <>
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
                Hold Option
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
                  ? "Tap the mic, or hold Option to record and release to keep the text in the draft. Kai still plans around energy, buffers, and deadlines instead of treating the calendar like a wall of equal blocks."
                  : "Kai plans around energy, buffers, and deadlines instead of treating the calendar like a wall of equal blocks."}
          </p>
        </footer>
      </section>

      <ExecutionRail
        liveModelLabel={liveModelLabel}
        plan={executionPlan}
        profile={activeProfile}
        storageState={storageState}
        historyRuns={plannerHistory}
        selectedHistoryRunId={selectedHistoryRunId}
        historyLoading={historyLoading}
        timerLabel={timerLabel}
        timerRunning={timerRunning}
        timerProgressPercent={timerProgressPercent}
        activeRunSource={activePlanSource}
        onUpdateBlockStatus={handleUpdateBlockStatus}
        onStartTimer={handleStartTimer}
        onPauseTimer={handlePauseTimer}
        onResetTimer={handleResetTimer}
        onSelectHistoryRun={handleSelectHistoryRun}
        onDeleteHistoryRun={handleDeleteHistoryRun}
        onReturnToLivePlan={handleReturnToLivePlan}
        canReturnToLivePlan={Boolean(currentGeneratedPlan)}
        leaderboardName={viewer.isGuest ? "You" : viewer.name}
        scoreboard={accountScoreboard}
        deletingHistoryRunId={deletingHistoryRunId}
        protectedHistoryRunId={activeRunId}
      />
    </DesktopShell>
  );
}
