"use client";

import { useMemo, useState } from "react";
import type { KaiExecutionBlock, KaiExecutionPlan, KaiUserProfile } from "@/lib/kai-prompt";
import type { PlannerHistoryRun } from "@/lib/plan-store";
import { formatTrackedDuration, getBlockTargetPoints, type ScoreboardSummary } from "@/lib/scoreboard";

type StorageState = "disabled" | "local" | "saving" | "saved" | "error";

interface ExecutionRailProps {
  liveModelLabel?: string | null;
  plan: KaiExecutionPlan | null;
  profile: KaiUserProfile | null;
  taskFlowMessage?: string | null;
  storageState: StorageState;
  historyRuns: PlannerHistoryRun[];
  selectedHistoryRunId: string | null;
  historyLoading: boolean;
  timerLabel: string;
  timerRunning: boolean;
  timerProgressPercent: number;
  activeRunSource: "live" | "history" | "none";
  onUpdateBlockStatus: (blockId: string, status: KaiExecutionBlock["status"]) => void;
  onStartTimer: () => void;
  onPauseTimer: () => void;
  onResetTimer: () => void;
  onSelectHistoryRun: (runId: string) => void;
  onDeleteHistoryRun: (runId: string) => void;
  onReturnToLivePlan: () => void;
  canReturnToLivePlan?: boolean;
  leaderboardName: string;
  scoreboard: ScoreboardSummary;
  deletingHistoryRunId?: string | null;
  protectedHistoryRunId?: string | null;
}

function formatClockLabel(value: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return value || "Time TBD";
  }

  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) {
    return value;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 || 12;
  return `${normalizedHour}:${minute} ${suffix}`;
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function kindAccent(kind: KaiExecutionBlock["kind"]) {
  switch (kind) {
    case "task":
      return "border-orange-300/20 bg-orange-300/10 text-orange-100";
    case "break":
    case "recovery":
      return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
    case "buffer":
    case "commute":
      return "border-sky-300/20 bg-sky-300/10 text-sky-100";
    case "fixed":
      return "border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-100";
    case "meal":
      return "border-yellow-300/20 bg-yellow-300/10 text-yellow-100";
    case "workout":
      return "border-red-300/20 bg-red-300/10 text-red-100";
    default:
      return "border-white/10 bg-white/6 text-white/75";
  }
}

function storageCopy(storageState: StorageState) {
  switch (storageState) {
    case "saving":
      return "Saving the latest plan to Supabase…";
    case "saved":
      return "Latest plan synced to Supabase.";
    case "error":
      return "Supabase save failed for this plan. Open the console once and Verge should now show the exact planner table error.";
    case "disabled":
      return "Supabase auth is not configured yet, so plans stay local in this shell.";
    default:
      return "This plan is live in the UI and ready for persistence once sign-in is active.";
  }
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">{label}</p>
      <p className="mt-2 text-sm text-white/88">{value}</p>
    </div>
  );
}

export default function ExecutionRail({
  liveModelLabel,
  plan,
  profile,
  taskFlowMessage = null,
  storageState,
  historyRuns,
  selectedHistoryRunId,
  historyLoading,
  timerLabel,
  timerRunning,
  timerProgressPercent,
  activeRunSource,
  onUpdateBlockStatus,
  onStartTimer,
  onPauseTimer,
  onResetTimer,
  onSelectHistoryRun,
  onDeleteHistoryRun,
  onReturnToLivePlan,
  canReturnToLivePlan = false,
  leaderboardName,
  scoreboard,
  deletingHistoryRunId = null,
  protectedHistoryRunId = null,
}: ExecutionRailProps) {
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const blocks = plan?.blocks ?? [];
  const actionableBlocks = blocks;
  const currentBlock = blocks.find((block) => block.status === "pending") ?? null;
  const completedCount = blocks.filter((block) => block.status === "completed").length;
  const skippedCount = blocks.filter((block) => block.status === "skipped").length;
  const pendingCount = blocks.filter((block) => block.status === "pending").length;
  const selectedHistoryRun = historyRuns.find((run) => run.id === selectedHistoryRunId) ?? null;
  const currentScoreEntry = useMemo(
    () => scoreboard.entries.find((entry) => entry.isCurrent) || null,
    [scoreboard.entries],
  );
  const completedScoreEntries = useMemo(
    () => scoreboard.completedEntries.filter((entry) => !entry.isCurrent),
    [scoreboard.completedEntries],
  );

  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-white/8 p-4 lg:border-t-0 lg:border-l lg:p-5">
      <article className="rounded-[26px] border border-white/10 bg-white/[0.05] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-200/80">Execution plan</p>
            <h3 className="mt-3 text-lg font-semibold text-white">{plan?.scope_label || "No active plan yet"}</h3>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">
              {activeRunSource === "live" ? "Live" : activeRunSource === "history" ? "History" : "Idle"}
            </span>
            {activeRunSource === "history" && canReturnToLivePlan ? (
              <button
                onClick={onReturnToLivePlan}
                className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/72 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                type="button"
              >
                Back to live
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <MetricCard label="Pending" value={String(pendingCount)} />
          <MetricCard label="Done" value={String(completedCount)} />
          <MetricCard label="Skipped" value={String(skippedCount)} />
        </div>

        <p className="mt-4 text-sm leading-6 text-white/58">
          {taskFlowMessage || plan?.focus_strategy || profile?.summary || "Saved schedules and task blocks will show up here once Kai makes a concrete plan."}
        </p>
      </article>

      <article className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Active timer</p>
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
            {timerRunning ? "Running" : "Paused"}
          </span>
        </div>
        {currentBlock ? (
          <>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-white">{currentBlock.title}</h4>
                <p className="mt-1 text-xs text-white/45">
                  {formatClockLabel(currentBlock.start_time)} to {formatClockLabel(currentBlock.end_time)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="rounded-full border border-orange-300/20 bg-orange-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-100">
                  {currentScoreEntry?.targetPoints || getBlockTargetPoints(currentBlock)} pts
                </span>
                <span className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
                  {currentScoreEntry?.priorityBand || "medium"}
                </span>
              </div>
            </div>
            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.05] px-4 py-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Countdown</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{timerLabel}</p>
                  {currentScoreEntry ? (
                    <p className="mt-2 text-xs text-white/50">
                      {currentScoreEntry.earnedPoints}/{currentScoreEntry.targetPoints} pts earned
                    </p>
                  ) : null}
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${kindAccent(currentBlock.kind)}`}
                >
                  {currentBlock.kind}
                </span>
              </div>
              <div className="mt-4 h-2 rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-300 via-orange-200 to-yellow-200 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, timerProgressPercent))}%` }}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={timerRunning ? onPauseTimer : onStartTimer}
                  className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-white/90"
                  type="button"
                >
                  {timerRunning ? "Pause" : "Start"}
                </button>
                <button
                  onClick={onResetTimer}
                  className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  type="button"
                >
                  Reset
                </button>
                <button
                  onClick={() => onUpdateBlockStatus(currentBlock.id, "completed")}
                  className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100 transition hover:bg-emerald-300/20"
                  type="button"
                >
                  Complete
                </button>
                {currentBlock.can_skip ? (
                  <button
                    onClick={() => onUpdateBlockStatus(currentBlock.id, "skipped")}
                    className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                    type="button"
                  >
                    Skip
                  </button>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm leading-6 text-white/58">
            {taskFlowMessage || "No pending block is active right now. Generate a schedule or open one from history."}
          </p>
        )}
      </article>

      <article className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Queue</p>
        {blocks.length ? (
          <div className="mt-4 space-y-3">
            {blocks.map((block, index) => (
              <div
                key={`${block.id}_${index}`}
                className={`rounded-[22px] border px-4 py-3 ${
                  block.status === "completed"
                    ? "border-emerald-300/20 bg-emerald-300/10"
                    : block.status === "skipped"
                      ? "border-white/8 bg-white/[0.03]"
                      : "border-white/10 bg-white/[0.05]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${kindAccent(block.kind)}`}
                      >
                        {block.kind}
                      </span>
                      {getBlockTargetPoints(block) > 0 ? (
                        <span className="rounded-full border border-orange-300/20 bg-orange-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-100">
                          {getBlockTargetPoints(block)} pts
                        </span>
                      ) : null}
                      <span className="text-[11px] text-white/45">{block.date_label || plan?.scope_label}</span>
                    </div>
                    <h4 className="mt-2 text-sm font-semibold text-white/92">{block.title}</h4>
                  </div>
                  <span className="text-[11px] text-white/45">
                    {formatClockLabel(block.start_time)}
                    {block.end_time ? ` – ${formatClockLabel(block.end_time)}` : ""}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-white/58">
                  {block.notes || `${block.duration_minutes} min • ${block.focus_level} focus • ${block.energy_match} energy`}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-white/58">{taskFlowMessage || "No execution blocks yet."}</p>
        )}
      </article>

      <article className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Leaderboard</p>
          <span className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
            local
          </span>
        </div>

        <button
          onClick={() => setLeaderboardOpen((currentValue) => !currentValue)}
          className="mt-4 flex w-full items-center justify-between rounded-[22px] border border-white/10 bg-white/[0.05] px-4 py-4 text-left transition hover:border-white/20 hover:bg-white/[0.07]"
          type="button"
        >
          <div>
            <p className="text-sm font-semibold text-white/92">{leaderboardName}</p>
            <p className="mt-1 text-xs text-white/50">
              {currentScoreEntry
                ? `Working on ${currentScoreEntry.title} · ${formatTrackedDuration(currentScoreEntry.elapsedSeconds)}`
                : "Open to see live points and completed tasks"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-white">{scoreboard.totalEarnedPoints} pts</p>
            <p className="text-[11px] text-white/40">of {scoreboard.totalAvailablePoints}</p>
          </div>
        </button>

        {leaderboardOpen ? (
          <div className="mt-4 space-y-3">
            {currentScoreEntry ? (
              <div className="rounded-[22px] border border-orange-300/20 bg-orange-300/10 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-100/75">Live progress</p>
                    <h4 className="mt-2 text-sm font-semibold text-white">{currentScoreEntry.title}</h4>
                  </div>
                  <span className="rounded-full border border-orange-300/20 bg-black/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-50">
                    {currentScoreEntry.earnedPoints}/{currentScoreEntry.targetPoints} pts
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-white/70">
                  Working for {formatTrackedDuration(currentScoreEntry.elapsedSeconds)} so far.
                </p>
              </div>
            ) : (
              <div className="rounded-[22px] border border-white/10 bg-white/[0.05] px-4 py-4">
                <p className="text-sm text-white/72">Start a timer on an important task to begin earning points.</p>
              </div>
            )}

            {completedScoreEntries.length ? (
              <div className="rounded-[22px] border border-white/10 bg-white/[0.05] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Completed and earned</p>
                <div className="mt-3 space-y-3">
                  {completedScoreEntries.map((entry) => (
                    <div key={entry.blockKey} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white/90">{entry.title}</p>
                        <p className="mt-1 text-xs text-white/45">
                          {entry.status === "completed" ? "Completed" : "In progress"} · {formatTrackedDuration(entry.elapsedSeconds)}
                        </p>
                      </div>
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                        {entry.earnedPoints} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </article>

      <article className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Recent plans</p>
          <span className="text-[11px] text-white/35">{historyLoading ? "Loading…" : `${historyRuns.length} saved`}</span>
        </div>

        {historyRuns.length ? (
          <div className="mt-4 space-y-3">
            {historyRuns.map((run) => {
              const isSelected = run.id === selectedHistoryRunId;
              const isDeleting = deletingHistoryRunId === run.id;
              const isProtected = protectedHistoryRunId === run.id;
              return (
                <div
                  key={run.id}
                  className={`rounded-[22px] border px-4 py-3 transition ${
                    isSelected
                      ? "border-orange-300/20 bg-orange-300/10"
                      : "border-white/10 bg-white/[0.05] hover:border-white/20 hover:bg-white/[0.07]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => onSelectHistoryRun(run.id)} className="min-w-0 flex-1 text-left" type="button">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white/92">{run.scopeLabel}</p>
                          <p className="mt-1 text-[11px] text-white/40">{formatHistoryDate(run.createdAt)}</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/55">
                          {run.blocks.length} blocks
                        </span>
                      </div>
                    </button>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/55">
                    {run.planSummary || run.focusStrategy || run.sourcePrompt || "Saved planner run"}
                  </p>
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => onDeleteHistoryRun(run.id)}
                      disabled={isDeleting || isProtected}
                      className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                        isProtected
                          ? "cursor-not-allowed border-white/10 bg-white/[0.04] text-white/30"
                          : isDeleting
                            ? "cursor-wait border-red-300/20 bg-red-300/10 text-red-100/70"
                            : "border-red-300/20 bg-red-300/10 text-red-100 hover:bg-red-300/20"
                      }`}
                      type="button"
                    >
                      {isProtected ? "Active" : isDeleting ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-white/58">No saved schedules yet.</p>
        )}

        {selectedHistoryRun ? (
          <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.05] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Selected history memory</p>
            <p className="mt-2 text-sm text-white/88">{selectedHistoryRun.scopeLabel}</p>
            <p className="mt-2 text-xs leading-5 text-white/58">
              Kai can now reference this saved schedule if you ask things like “reuse my last schedule” or “what did you have me do before?”
            </p>
          </div>
        ) : null}
      </article>

      <article className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Storage</p>
        <p className="mt-2 text-sm leading-6 text-white/58">{storageCopy(storageState)}</p>
        <p className="mt-3 text-xs text-white/35">
          {taskFlowMessage
            ? taskFlowMessage
            : `${actionableBlocks.length} actionable blocks ready for timers, scoring, and later leaderboard points.`}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <MetricCard label="Model" value={liveModelLabel || "Preview"} />
          <MetricCard label="History" value={historyRuns.length ? "Connected" : "Not loaded"} />
        </div>
      </article>
    </aside>
  );
}
