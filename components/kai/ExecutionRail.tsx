"use client";

import type { KaiExecutionBlock, KaiExecutionPlan, KaiUserProfile } from "@/lib/kai-prompt";

type StorageState = "disabled" | "local" | "saving" | "saved" | "error";

interface ExecutionRailProps {
  liveModelLabel?: string | null;
  plan: KaiExecutionPlan | null;
  profile: KaiUserProfile | null;
  storageState: StorageState;
  onUpdateBlockStatus: (blockId: string, status: KaiExecutionBlock["status"]) => void;
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
  storageState,
  onUpdateBlockStatus,
}: ExecutionRailProps) {
  const blocks = plan?.blocks ?? [];
  const actionableBlocks = blocks.filter((block) => block.kind === "task" || block.kind === "fixed" || block.kind === "workout");
  const currentBlock = blocks.find((block) => block.status === "pending") ?? null;
  const completedCount = blocks.filter((block) => block.status === "completed").length;
  const skippedCount = blocks.filter((block) => block.status === "skipped").length;
  const pendingCount = blocks.filter((block) => block.status === "pending").length;

  if (!plan) {
    const userProfile = profile?.user_profile;

    return (
      <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-white/8 p-4 lg:border-t-0 lg:border-l lg:p-5">
        <article className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-200/80">Execution rail</p>
          <h3 className="mt-3 text-lg font-semibold text-white">Waiting for a concrete schedule</h3>
          <p className="mt-2 text-sm leading-6 text-white/60">
            As soon as Kai returns a real schedule with timestamps, the plan will appear here as structured tasks and breaks instead of placeholder cards.
          </p>
        </article>

        <MetricCard label="Live planner route" value={liveModelLabel || "Preview / fallback"} />
        <MetricCard
          label="Focus window"
          value={userProfile?.energy_pattern?.peak ? `${userProfile.energy_pattern.peak} focus` : "Still collecting"}
        />
        <MetricCard
          label="Deadlines"
          value={
            userProfile?.deadlines?.length
              ? userProfile.deadlines.map((deadline) => deadline.label).slice(0, 2).join(" • ")
              : "No deadlines captured yet"
          }
        />
        <MetricCard
          label="Anchors"
          value={
            userProfile?.fixed_commitments?.length
              ? `${userProfile.fixed_commitments.length} fixed commitments`
              : "No fixed commitments captured yet"
          }
        />
        <article className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Storage</p>
          <p className="mt-2 text-sm leading-6 text-white/58">{storageCopy(storageState)}</p>
        </article>
      </aside>
    );
  }

  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-white/8 p-4 lg:border-t-0 lg:border-l lg:p-5">
      <article className="rounded-[26px] border border-white/10 bg-white/[0.05] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-200/80">Execution plan</p>
            <h3 className="mt-3 text-lg font-semibold text-white">{plan.scope_label || "Latest plan"}</h3>
          </div>
          <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">
            {plan.status}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <MetricCard label="Pending" value={String(pendingCount)} />
          <MetricCard label="Done" value={String(completedCount)} />
          <MetricCard label="Skipped" value={String(skippedCount)} />
        </div>

        <p className="mt-4 text-sm leading-6 text-white/58">
          {plan.focus_strategy || profile?.summary || "Kai turned the schedule into concrete execution blocks with real timing."}
        </p>
      </article>

      <article className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Current block</p>
        {currentBlock ? (
          <>
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${kindAccent(currentBlock.kind)}`}
              >
                {currentBlock.kind}
              </span>
              <span className="text-xs text-white/45">
                {formatClockLabel(currentBlock.start_time)} to {formatClockLabel(currentBlock.end_time)}
              </span>
            </div>
            <h4 className="mt-3 text-base font-semibold text-white">{currentBlock.title}</h4>
            <p className="mt-2 text-sm leading-6 text-white/58">
              {currentBlock.notes || `Energy match: ${currentBlock.energy_match}. Focus level: ${currentBlock.focus_level}.`}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => onUpdateBlockStatus(currentBlock.id, "completed")}
                className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-white/90"
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
          </>
        ) : (
          <p className="mt-3 text-sm leading-6 text-white/58">Everything in this plan has already been handled.</p>
        )}
      </article>

      <article className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Queue</p>
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
                    <span className="text-[11px] text-white/45">{block.date_label || plan.scope_label}</span>
                  </div>
                  <h4 className="mt-2 text-sm font-semibold text-white/92">{block.title}</h4>
                </div>
                <span className="text-[11px] text-white/45">
                  {formatClockLabel(block.start_time)}
                  {block.end_time ? ` – ${formatClockLabel(block.end_time)}` : ""}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/58">
                {block.notes ||
                  `${block.duration_minutes} min • ${block.focus_level} focus • ${block.energy_match} energy`}
              </p>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Storage</p>
        <p className="mt-2 text-sm leading-6 text-white/58">{storageCopy(storageState)}</p>
        <p className="mt-3 text-xs text-white/35">
          {actionableBlocks.length} actionable blocks ready for progress controls and timer hookups.
        </p>
      </article>
    </aside>
  );
}
