import type { KaiExecutionBlock, KaiExecutionPlan } from "@/lib/kai-prompt";
import type { PlannerHistoryRun } from "@/lib/plan-store";

const ACTIONABLE_KINDS = new Set<KaiExecutionBlock["kind"]>(["task", "fixed", "workout"]);
const HIGH_PRIORITY_PATTERN =
  /\b(test|exam|quiz|deadline|paper|essay|project|midterm|final|interview|presentation|study|calc|calculus|physics|chem|research|draft|outline)\b/i;
const LEADERBOARD_RESET_AT = Date.parse("2026-04-26T13:20:41-05:00");

export type ScoreEntry = {
  blockKey: string;
  sourceRunId: string | null;
  title: string;
  kind: KaiExecutionBlock["kind"];
  status: KaiExecutionBlock["status"];
  targetPoints: number;
  earnedPoints: number;
  elapsedSeconds: number;
  durationSeconds: number;
  priorityBand: "low" | "medium" | "high";
  isCurrent: boolean;
};

export type ScoreboardSummary = {
  totalEarnedPoints: number;
  totalAvailablePoints: number;
  currentEarnedPoints: number;
  currentTargetPoints: number;
  currentElapsedSeconds: number;
  entries: ScoreEntry[];
  completedEntries: ScoreEntry[];
};

export function isActionableBlock(block: KaiExecutionBlock) {
  return ACTIONABLE_KINDS.has(block.kind);
}

export function getBlockPriorityBand(block: KaiExecutionBlock): "low" | "medium" | "high" {
  if (block.priority_band === "high" || block.priority_band === "medium" || block.priority_band === "low") {
    return block.priority_band;
  }

  if (block.kind === "workout") {
    return "low";
  }

  if (block.focus_level === "deep" || block.energy_match === "peak" || HIGH_PRIORITY_PATTERN.test(block.title) || HIGH_PRIORITY_PATTERN.test(block.source_goal || "")) {
    return "high";
  }

  if (block.kind === "fixed" || block.focus_level === "light") {
    return "medium";
  }

  return "medium";
}

export function getBlockTargetPoints(block: KaiExecutionBlock) {
  if (!isActionableBlock(block)) {
    return 0;
  }

  const priorityBand = getBlockPriorityBand(block);
  const durationMinutes = Math.max(0, block.duration_minutes || 0);
  let basePoints = 0;

  if (typeof block.point_value === "number" && Number.isFinite(block.point_value) && block.point_value > 0) {
    basePoints = Math.round(block.point_value);
  } else if (block.kind === "workout") {
    basePoints = 5;
  } else {
    switch (priorityBand) {
      case "high":
        basePoints = 12;
        break;
      case "medium":
        basePoints = 7;
        break;
      case "low":
        basePoints = 4;
        break;
    }
  }

  if (durationMinutes <= 0) {
    return basePoints;
  }

  const scaledDurationMinutes = Math.min(180, Math.max(5, durationMinutes));
  const durationFactor = scaledDurationMinutes / 60;

  return Math.max(1, Math.round(basePoints * durationFactor));
}

export function formatTrackedDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export function buildScoreboardSummary({
  plan,
  elapsedSecondsByBlock,
  currentBlockKey,
}: {
  plan: KaiExecutionPlan | null;
  elapsedSecondsByBlock: Record<string, number>;
  currentBlockKey: string | null;
}): ScoreboardSummary {
  const entries = buildScoreEntriesForPlan({
    plan,
    sourceRunId: null,
    elapsedSecondsByBlock,
    currentBlockKey,
  });

  return summarizeEntries(entries);
}

export function buildAccountScoreboard({
  historyRuns,
  activePlan,
  activeRunId,
  elapsedSecondsByBlock,
  currentBlockKey,
}: {
  historyRuns: PlannerHistoryRun[];
  activePlan: KaiExecutionPlan | null;
  activeRunId: string | null;
  elapsedSecondsByBlock: Record<string, number>;
  currentBlockKey: string | null;
}): ScoreboardSummary {
  const eligibleHistoryRuns = historyRuns.filter((run) => isRunEligibleForLeaderboard(run.createdAt));

  const historyEntries = eligibleHistoryRuns.flatMap((run) =>
    buildScoreEntriesForPlan({
      plan: {
        plan_id: run.planKey,
        scope_label: run.scopeLabel,
        status: run.planStatus === "ready" ? "ready" : "draft",
        timezone: run.timezone,
        focus_strategy: run.focusStrategy || run.planSummary || "",
        blocks: run.blocks,
      },
      sourceRunId: run.id,
      elapsedSecondsByBlock: {},
      currentBlockKey: null,
    }),
  );

  const filteredHistoryEntries = activeRunId
    ? historyEntries.filter((entry) => entry.sourceRunId !== activeRunId)
    : historyEntries;

  const activeRunFromHistory = activeRunId ? historyRuns.find((run) => run.id === activeRunId) || null : null;
  const shouldIncludeActivePlan =
    !activeRunFromHistory || isRunEligibleForLeaderboard(activeRunFromHistory.createdAt);
  const activeEntries = shouldIncludeActivePlan
    ? buildScoreEntriesForPlan({
        plan: activePlan,
        sourceRunId: activeRunId,
        elapsedSecondsByBlock,
        currentBlockKey,
      })
    : [];

  const summary = summarizeEntries([...filteredHistoryEntries, ...activeEntries]);

  if (!activePlan && !activeRunId) {
    return {
      ...summary,
      totalAvailablePoints: summary.totalEarnedPoints,
    };
  }

  return summary;
}

function isRunEligibleForLeaderboard(createdAt: string) {
  const createdAtMs = Date.parse(createdAt);

  if (Number.isNaN(createdAtMs)) {
    return true;
  }

  return createdAtMs >= LEADERBOARD_RESET_AT;
}

function buildScoreEntriesForPlan({
  plan,
  sourceRunId,
  elapsedSecondsByBlock,
  currentBlockKey,
}: {
  plan: KaiExecutionPlan | null;
  sourceRunId: string | null;
  elapsedSecondsByBlock: Record<string, number>;
  currentBlockKey: string | null;
}) {
  return (plan?.blocks || [])
    .filter(isActionableBlock)
    .map((block) => {
      const durationSeconds = Math.max(0, (block.duration_minutes || 0) * 60);
      const blockKey = `${plan?.plan_id || "plan"}:${block.id}`;
      const hasPersistedTrackedSeconds =
        typeof block.tracked_elapsed_seconds === "number" && Number.isFinite(block.tracked_elapsed_seconds);
      const persistedTrackedSeconds = hasPersistedTrackedSeconds ? Math.max(0, block.tracked_elapsed_seconds || 0) : 0;
      const trackedSeconds =
        block.status === "completed"
          ? hasPersistedTrackedSeconds
            ? Math.min(durationSeconds, persistedTrackedSeconds)
            : durationSeconds
          : Math.min(durationSeconds, Math.max(persistedTrackedSeconds, elapsedSecondsByBlock[blockKey] || 0));
      const targetPoints = getBlockTargetPoints(block);
      const earnedPoints =
        typeof block.earned_points === "number" && Number.isFinite(block.earned_points)
          ? Math.min(targetPoints, Math.max(0, Math.round(block.earned_points)))
          : durationSeconds > 0
            ? Math.min(targetPoints, Math.floor(targetPoints * (trackedSeconds / durationSeconds)))
            : 0;

      return {
        blockKey,
        sourceRunId,
        title: block.title,
        kind: block.kind,
        status: block.status,
        targetPoints,
        earnedPoints,
        elapsedSeconds: trackedSeconds,
        durationSeconds,
        priorityBand: getBlockPriorityBand(block),
        isCurrent: currentBlockKey === blockKey,
      } satisfies ScoreEntry;
    });
}

function summarizeEntries(entries: ScoreEntry[]): ScoreboardSummary {
  const totalEarnedPoints = entries.reduce((sum, entry) => sum + entry.earnedPoints, 0);
  const totalAvailablePoints = entries.reduce((sum, entry) => sum + entry.targetPoints, 0);
  const currentEntry = entries.find((entry) => entry.isCurrent) || null;

  return {
    totalEarnedPoints,
    totalAvailablePoints,
    currentEarnedPoints: currentEntry?.earnedPoints || 0,
    currentTargetPoints: currentEntry?.targetPoints || 0,
    currentElapsedSeconds: currentEntry?.elapsedSeconds || 0,
    entries,
    completedEntries: entries.filter((entry) => entry.status === "completed" || entry.earnedPoints > 0),
  };
}
