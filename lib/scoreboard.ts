import type { KaiExecutionBlock, KaiExecutionPlan } from "@/lib/kai-prompt";

const ACTIONABLE_KINDS = new Set<KaiExecutionBlock["kind"]>(["task", "fixed", "workout"]);
const HIGH_PRIORITY_PATTERN =
  /\b(test|exam|quiz|deadline|paper|essay|project|midterm|final|interview|presentation|study|calc|calculus|physics|chem|research|draft|outline)\b/i;

export type ScoreEntry = {
  blockKey: string;
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

  if (typeof block.point_value === "number" && Number.isFinite(block.point_value) && block.point_value > 0) {
    return Math.round(block.point_value);
  }

  const priorityBand = getBlockPriorityBand(block);

  if (block.kind === "workout") {
    return 5;
  }

  switch (priorityBand) {
    case "high":
      return 10;
    case "medium":
      return 7;
    case "low":
      return 4;
  }
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
  const entries = (plan?.blocks || [])
    .filter(isActionableBlock)
    .map((block) => {
      const durationSeconds = Math.max(0, (block.duration_minutes || 0) * 60);
      const blockKey = `${plan?.plan_id || "plan"}:${block.id}`;
      const trackedSeconds =
        block.status === "completed"
          ? durationSeconds
          : Math.min(durationSeconds, Math.max(0, elapsedSecondsByBlock[blockKey] || 0));
      const targetPoints = getBlockTargetPoints(block);
      const earnedPoints =
        block.status === "completed"
          ? targetPoints
          : durationSeconds > 0
            ? Math.min(targetPoints, Math.floor(targetPoints * (trackedSeconds / durationSeconds)))
            : 0;

      return {
        blockKey,
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
