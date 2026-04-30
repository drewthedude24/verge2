import { isTaskFlowEligibleBlock, normalizeExecutionSurface } from "@/lib/execution-flow";
import type { KaiExecutionBlock, KaiExecutionPlan, KaiUserProfile } from "@/lib/kai-prompt";
import type { BrowserSupabaseClient } from "@/lib/supabase";

const HIGH_PRIORITY_PATTERN =
  /\b(test|exam|quiz|deadline|due|paper|essay|project|midterm|final|interview|presentation|study|calc|calculus|physics|chem|research|draft|outline|submit)\b/i;
const LOW_PRIORITY_PATTERN = /\b(review|organize|admin|email|follow up|prep|light)\b/i;
const OFFLINE_CANDIDATE_PATTERN =
  /\b(school|class|lecture|campus|commute|drive|travel|bus|train|walk|dinner|lunch|breakfast|meal|golf|gym|workout|practice|shower|sleep|nap|errand|chores?|hangout|social|family time)\b/i;

type SaveExecutionPlanInput = {
  supabase: BrowserSupabaseClient;
  userId: string;
  providerLabel?: string | null;
  profile: KaiUserProfile;
  sourcePrompt: string;
};

type SaveExecutionPlanResult = {
  runId: string;
};

type UpdateExecutionBlockStatusInput = {
  supabase: BrowserSupabaseClient;
  runId: string;
  blockId: string;
  status: KaiExecutionBlock["status"];
  elapsedSeconds?: number;
  earnedPoints?: number;
  pointValue?: number | null;
  priorityBand?: "low" | "medium" | "high" | null;
  executionSurface?: "in_app" | "offline" | "none" | null;
};

type SupabaseErrorLike = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

type SingleRowResult<Row> = Promise<{
  data: Row | null;
  error: SupabaseErrorLike | null;
}>;

type MutationResult = Promise<{
  error: SupabaseErrorLike | null;
}>;

type SelectResult<Row> = Promise<{
  data: Row[] | null;
  error: SupabaseErrorLike | null;
}>;

type PlannerRunsTable = {
  insert: (values: unknown) => {
    select: (columns: string) => {
      single: () => SingleRowResult<{ id: string }>;
    };
  };
};

type PlannerBlocksInsertTable = {
  insert: (values: unknown) => MutationResult;
};

type PlannerBlocksUpdateTable = {
  update: (values: unknown) => {
    eq: (column: string, value: string) => {
      eq: (nextColumn: string, nextValue: string) => MutationResult;
    };
  };
};

type PlannerRunsDeleteTable = {
  delete: () => {
    eq: (column: string, value: string) => {
      eq: (nextColumn: string, nextValue: string) => MutationResult;
    };
  };
};

type PlannerRunsSelectTable<Row> = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      order: (column: string, options?: { ascending?: boolean }) => {
        limit: (value: number) => SelectResult<Row>;
      };
    };
  };
};

type PlannerBlocksSelectTable<Row> = {
  select: (columns: string) => {
    in: (column: string, values: string[]) => {
      order: (column: string, options?: { ascending?: boolean }) => SelectResult<Row>;
    };
  };
};

function plannerRunsTable(supabase: BrowserSupabaseClient) {
  return supabase.from("planner_runs" as never) as unknown as PlannerRunsTable;
}

function plannerBlocksInsertTable(supabase: BrowserSupabaseClient) {
  return supabase.from("planner_blocks" as never) as unknown as PlannerBlocksInsertTable;
}

function plannerBlocksUpdateTable(supabase: BrowserSupabaseClient) {
  return supabase.from("planner_blocks" as never) as unknown as PlannerBlocksUpdateTable;
}

function plannerRunsSelectTable<Row>(supabase: BrowserSupabaseClient) {
  return supabase.from("planner_runs" as never) as unknown as PlannerRunsSelectTable<Row>;
}

function plannerRunsDeleteTable(supabase: BrowserSupabaseClient) {
  return supabase.from("planner_runs" as never) as unknown as PlannerRunsDeleteTable;
}

function plannerBlocksSelectTable<Row>(supabase: BrowserSupabaseClient) {
  return supabase.from("planner_blocks" as never) as unknown as PlannerBlocksSelectTable<Row>;
}

function formatSupabaseError(table: string, operation: string, error: SupabaseErrorLike | null | undefined) {
  if (!error) {
    return `${table} ${operation} failed.`;
  }

  const parts = [`${table} ${operation} failed: ${error.message}`];

  if (error.code) {
    parts.push(`code=${error.code}`);
  }

  if (error.details) {
    parts.push(`details=${error.details}`);
  }

  if (error.hint) {
    parts.push(`hint=${error.hint}`);
  }

  return parts.join(" | ");
}

function normalizeBlock(block: KaiExecutionBlock, index: number) {
  return {
    block_key: block.id || `block_${index + 1}`,
    position: index,
    title: block.title,
    kind: block.kind,
    date_label: block.date_label || null,
    start_time: block.start_time || null,
    end_time: block.end_time || null,
    duration_minutes: Number.isFinite(block.duration_minutes) ? block.duration_minutes : null,
    focus_level: block.focus_level,
    energy_match: block.energy_match,
    status: block.status,
    can_skip: block.can_skip,
    source_goal: block.source_goal,
    notes: block.notes,
    metadata: {
      plan_id: block.id || `block_${index + 1}`,
      point_value: block.point_value ?? null,
      priority_band: block.priority_band ?? null,
      execution_surface: block.execution_surface ?? null,
      tracked_elapsed_seconds: block.tracked_elapsed_seconds ?? null,
      earned_points: block.earned_points ?? null,
    },
  };
}

type PlannerRunRow = {
  id: string;
  plan_key: string;
  scope_label: string;
  plan_status: string;
  timezone: string | null;
  focus_strategy: string | null;
  plan_summary: string | null;
  source_prompt: string | null;
  provider_label: string | null;
  raw_profile: KaiUserProfile | null;
  created_at: string;
};

type PlannerBlockRow = {
  run_id: string;
  block_key: string;
  position: number;
  title: string;
  kind: KaiExecutionBlock["kind"];
  date_label: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  focus_level: KaiExecutionBlock["focus_level"] | null;
  energy_match: KaiExecutionBlock["energy_match"] | null;
  status: KaiExecutionBlock["status"] | null;
  can_skip: boolean | null;
  source_goal: string | null;
  notes: string | null;
  metadata?: {
    point_value?: number | null;
    priority_band?: "low" | "medium" | "high" | null;
    execution_surface?: "in_app" | "offline" | "none" | null;
    tracked_elapsed_seconds?: number | null;
    earned_points?: number | null;
  } | null;
};

export type PlannerHistoryRun = {
  id: string;
  planKey: string;
  scopeLabel: string;
  planStatus: string;
  timezone: string | null;
  focusStrategy: string | null;
  planSummary: string | null;
  sourcePrompt: string | null;
  providerLabel: string | null;
  createdAt: string;
  rawProfile: KaiUserProfile | null;
  blocks: KaiExecutionBlock[];
};

function normalizeStoredBlock(row: PlannerBlockRow): KaiExecutionBlock {
  return {
    id: row.block_key,
    title: row.title,
    kind: row.kind || "task",
    date_label: row.date_label || "",
    start_time: row.start_time || "",
    end_time: row.end_time || "",
    duration_minutes: row.duration_minutes ?? 0,
    status: row.status || "pending",
    focus_level: row.focus_level || "light",
    energy_match: row.energy_match || "unknown",
    point_value: row.metadata?.point_value ?? null,
    priority_band: row.metadata?.priority_band ?? null,
    execution_surface: row.metadata?.execution_surface ?? null,
    tracked_elapsed_seconds: row.metadata?.tracked_elapsed_seconds ?? null,
    earned_points: row.metadata?.earned_points ?? null,
    can_skip: row.can_skip ?? true,
    source_goal: row.source_goal || null,
    notes: row.notes || null,
  };
}

export async function loadPlannerHistory({
  supabase,
  userId,
  limit = 50,
}: {
  supabase: BrowserSupabaseClient;
  userId: string;
  limit?: number;
}): Promise<PlannerHistoryRun[]> {
  const plannerRuns = plannerRunsSelectTable<PlannerRunRow>(supabase);
  const plannerBlocks = plannerBlocksSelectTable<PlannerBlockRow>(supabase);

  const { data: runRows, error: runError } = await plannerRuns
    .select("id, plan_key, scope_label, plan_status, timezone, focus_strategy, plan_summary, source_prompt, provider_label, raw_profile, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (runError) {
    throw new Error(formatSupabaseError("planner_runs", "select", runError));
  }

  if (!runRows?.length) {
    return [];
  }

  const runIds = runRows.map((row) => row.id);
  const { data: blockRows, error: blockError } = await plannerBlocks
    .select("run_id, block_key, position, title, kind, date_label, start_time, end_time, duration_minutes, focus_level, energy_match, status, can_skip, source_goal, notes, metadata")
    .in("run_id", runIds)
    .order("position", { ascending: true });

  if (blockError) {
    throw new Error(formatSupabaseError("planner_blocks", "select", blockError));
  }

  const groupedBlocks = new Map<string, KaiExecutionBlock[]>();
  for (const row of blockRows || []) {
    const existing = groupedBlocks.get(row.run_id) || [];
    existing.push(normalizeStoredBlock(row));
    groupedBlocks.set(row.run_id, existing);
  }

  return runRows.map((row) => ({
    id: row.id,
    planKey: row.plan_key,
    scopeLabel: row.scope_label,
    planStatus: row.plan_status,
    timezone: row.timezone,
    focusStrategy: row.focus_strategy,
    planSummary: row.plan_summary,
    sourcePrompt: row.source_prompt,
    providerLabel: row.provider_label,
    createdAt: row.created_at,
    rawProfile: row.raw_profile,
    blocks: groupedBlocks.get(row.id) || [],
  }));
}

function formatHistoryBlocksForPrompt(blocks: KaiExecutionBlock[]) {
  return blocks
    .slice(0, 8)
    .map((block) => {
      const timeLabel = [block.start_time, block.end_time].filter(Boolean).join("–");
      return `${timeLabel || "time tbd"} ${block.title} [${block.kind}, ${block.status}]`;
    })
    .join("; ");
}

export function buildPlannerHistoryContext({
  runs,
  userText,
  selectedRunId,
}: {
  runs: PlannerHistoryRun[];
  userText: string;
  selectedRunId?: string | null;
}) {
  const lower = userText.toLowerCase();
  const explicitlyAskedForHistory = /\b(previous|past|before|earlier|last time|last schedule|old schedule|yesterday|history|what did you make)\b/.test(
    lower,
  );
  const selectedRun = selectedRunId ? runs.find((run) => run.id === selectedRunId) : null;

  if (!selectedRun && !explicitlyAskedForHistory) {
    return null;
  }

  const chosenRuns = selectedRun ? [selectedRun] : runs.slice(0, 3);
  if (!chosenRuns.length) {
    return null;
  }

  return [
    "Saved schedule history from Supabase:",
    ...chosenRuns.map((run, index) => {
      const summaryBits = [
        `Run ${index + 1}: ${run.scopeLabel}`,
        `created ${run.createdAt}`,
        run.planSummary || "No summary",
        `Blocks: ${formatHistoryBlocksForPrompt(run.blocks)}`,
      ];

      return summaryBits.join(" | ");
    }),
  ].join("\n");
}

export async function saveExecutionPlan({
  supabase,
  userId,
  providerLabel,
  profile,
  sourcePrompt,
}: SaveExecutionPlanInput): Promise<SaveExecutionPlanResult> {
  const executionPlan = buildLocalExecutionPlan(profile);
  if (!executionPlan) {
    throw new Error("No execution plan is available to save.");
  }

  const persistedProfile: KaiUserProfile = {
    ...profile,
    execution_plan: executionPlan,
  };

  const runPayload = {
    user_id: userId,
    plan_key: executionPlan.plan_id || crypto.randomUUID(),
    scope_label: executionPlan.scope_label,
    plan_status: executionPlan.status,
    timezone: executionPlan.timezone,
    focus_strategy: executionPlan.focus_strategy,
    plan_summary: profile.summary,
    source_prompt: sourcePrompt,
    provider_label: providerLabel || null,
    raw_profile: persistedProfile,
  };

  const plannerRuns = plannerRunsTable(supabase);
  const plannerBlocks = plannerBlocksInsertTable(supabase);

  const { data: runData, error: runError } = await plannerRuns
    .insert(runPayload)
    .select("id")
    .single();

  if (runError || !runData?.id) {
    throw new Error(formatSupabaseError("planner_runs", "insert", runError));
  }

  const blockPayload = (executionPlan.blocks || []).map((block, index) => ({
    run_id: runData.id,
    ...normalizeBlock(block, index),
  }));

  if (blockPayload.length) {
    const { error: blockError } = await plannerBlocks.insert(blockPayload);
    if (blockError) {
      throw new Error(formatSupabaseError("planner_blocks", "insert", blockError));
    }
  }

  return {
    runId: runData.id,
  };
}

export async function updateExecutionBlockStatus({
  supabase,
  runId,
  blockId,
  status,
  elapsedSeconds,
  earnedPoints,
  pointValue,
  priorityBand,
  executionSurface,
}: UpdateExecutionBlockStatusInput) {
  const plannerBlocks = plannerBlocksUpdateTable(supabase);

  const { error } = await plannerBlocks
    .update({
      status,
      metadata: {
        plan_id: blockId,
        point_value: pointValue ?? null,
        priority_band: priorityBand ?? null,
        execution_surface: executionSurface ?? null,
        tracked_elapsed_seconds: typeof elapsedSeconds === "number" ? elapsedSeconds : null,
        earned_points: typeof earnedPoints === "number" ? earnedPoints : null,
      },
    })
    .eq("run_id", runId)
    .eq("block_key", blockId);

  if (error) {
    throw new Error(formatSupabaseError("planner_blocks", "update", error));
  }
}

export async function deletePlannerRun({
  supabase,
  userId,
  runId,
}: {
  supabase: BrowserSupabaseClient;
  userId: string;
  runId: string;
}) {
  const plannerRuns = plannerRunsDeleteTable(supabase);

  const { error } = await plannerRuns.delete().eq("id", runId).eq("user_id", userId);

  if (error) {
    throw new Error(formatSupabaseError("planner_runs", "delete", error));
  }
}

function slugifyPlanText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function inferPriorityBand(label: string, urgency?: "low" | "medium" | "high" | null): "low" | "medium" | "high" {
  if (urgency === "high" || urgency === "medium" || urgency === "low") {
    return urgency;
  }

  if (HIGH_PRIORITY_PATTERN.test(label)) {
    return "high";
  }

  if (LOW_PRIORITY_PATTERN.test(label)) {
    return "low";
  }

  return "medium";
}

function inferDurationMinutes(priorityBand: "low" | "medium" | "high") {
  switch (priorityBand) {
    case "high":
      return 90;
    case "low":
      return 45;
    default:
      return 60;
  }
}

function inferPointValue(priorityBand: "low" | "medium" | "high") {
  switch (priorityBand) {
    case "high":
      return 10;
    case "low":
      return 3;
    default:
      return 6;
  }
}

function normalizeExecutionBlock(block: KaiExecutionBlock, index: number): KaiExecutionBlock {
  return {
    ...block,
    id: block.id || `block_${index + 1}`,
    status: block.status || "pending",
    point_value: typeof block.point_value === "number" ? block.point_value : null,
    priority_band: block.priority_band || null,
    execution_surface: normalizeExecutionSurface(block),
    tracked_elapsed_seconds: typeof block.tracked_elapsed_seconds === "number" ? block.tracked_elapsed_seconds : null,
    earned_points: typeof block.earned_points === "number" ? block.earned_points : null,
    can_skip: typeof block.can_skip === "boolean" ? block.can_skip : true,
    notes: block.notes || null,
    source_goal: block.source_goal || null,
  };
}

function buildFallbackTaskSeeds(profile: KaiUserProfile) {
  const seeds: Array<{ title: string; priorityBand: "low" | "medium" | "high"; sourceGoal: string }> = [];
  const seen = new Set<string>();

  for (const deadline of profile.user_profile.deadlines || []) {
    const title = (deadline.label || "").trim();
    if (!title || OFFLINE_CANDIDATE_PATTERN.test(title)) {
      continue;
    }

    const key = slugifyPlanText(title);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    seeds.push({
      title,
      priorityBand: inferPriorityBand(title, deadline.urgency),
      sourceGoal: title,
    });
  }

  for (const goal of profile.user_profile.goals || []) {
    const title = (goal || "").trim();
    if (!title || OFFLINE_CANDIDATE_PATTERN.test(title)) {
      continue;
    }

    const key = slugifyPlanText(title);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    seeds.push({
      title,
      priorityBand: inferPriorityBand(title, null),
      sourceGoal: title,
    });
  }

  return seeds.slice(0, 6);
}

function buildFallbackExecutionPlan(profile: KaiUserProfile, basePlan: KaiExecutionPlan | null): KaiExecutionPlan | null {
  if (basePlan?.timeline_mode === "multi_day") {
    return basePlan;
  }

  const seeds = buildFallbackTaskSeeds(profile);
  if (!seeds.length) {
    return basePlan;
  }

  const planKeyBasis =
    basePlan?.plan_id ||
    slugifyPlanText(
      [basePlan?.scope_label || "", ...seeds.map((seed) => seed.title)]
        .filter(Boolean)
        .join("-"),
    ) ||
    "fallback-task-flow";
  const scopeLabel = basePlan?.scope_label || "Today";
  const dateLabel = basePlan?.blocks.find((block) => block.date_label?.trim())?.date_label || scopeLabel;

  return {
    plan_id: planKeyBasis,
    scope_label: scopeLabel,
    timeline_mode: "single_day",
    status: "ready",
    timezone: basePlan?.timezone || profile.execution_plan?.timezone || null,
    focus_strategy:
      basePlan?.focus_strategy ||
      "Verge synthesized actionable desk-work tasks because Kai's structured schedule did not include enough in-app execution blocks.",
    blocks: seeds.map((seed, index) => {
      const durationMinutes = inferDurationMinutes(seed.priorityBand);
      const taskSlug = slugifyPlanText(seed.title) || `task-${index + 1}`;

      return {
        id: `${planKeyBasis}-${taskSlug}-${index + 1}`,
        title: seed.title,
        kind: "task",
        date_label: dateLabel,
        start_time: "",
        end_time: "",
        duration_minutes: durationMinutes,
        status: "pending",
        focus_level: seed.priorityBand === "high" ? "deep" : "light",
        energy_match: seed.priorityBand === "high" ? "peak" : "steady",
        priority_band: seed.priorityBand,
        point_value: inferPointValue(seed.priorityBand),
        execution_surface: "in_app",
        tracked_elapsed_seconds: null,
        earned_points: null,
        can_skip: true,
        source_goal: seed.sourceGoal,
        notes: "Fallback task generated from your saved goals and deadlines so Verge still has an actionable task flow.",
      } satisfies KaiExecutionBlock;
    }),
  };
}

export function buildLocalExecutionPlan(profile: KaiUserProfile | null): KaiExecutionPlan | null {
  if (!profile) {
    return null;
  }

  const normalizedPlan = profile.execution_plan
    ? {
        ...profile.execution_plan,
        timeline_mode: profile.execution_plan.timeline_mode || "single_day",
        blocks: (profile.execution_plan.blocks || []).map(normalizeExecutionBlock),
      }
    : null;

  if (normalizedPlan?.blocks.some((block) => isTaskFlowEligibleBlock(block))) {
    return normalizedPlan;
  }

  return buildFallbackExecutionPlan(profile, normalizedPlan);
}

export function buildExecutionPlanFromHistoryRun(run: PlannerHistoryRun): KaiExecutionPlan | null {
  if (!run.rawProfile?.execution_plan && !run.blocks.length && !run.rawProfile) {
    return null;
  }

  if (run.blocks.length) {
    return {
      plan_id: run.planKey,
      scope_label: run.scopeLabel,
      timeline_mode: run.rawProfile?.execution_plan?.timeline_mode || "single_day",
      status: run.planStatus === "ready" ? "ready" : "draft",
      timezone: run.timezone,
      focus_strategy: run.focusStrategy || run.planSummary || "",
      blocks: run.blocks.map((block) => ({
        ...block,
        id: block.id || crypto.randomUUID(),
      })),
    };
  }

  if (!run.rawProfile) {
    return null;
  }

  const fallbackPlan = buildLocalExecutionPlan(run.rawProfile);
  if (!fallbackPlan) {
    return null;
  }

  return {
    ...fallbackPlan,
    plan_id: run.planKey || fallbackPlan.plan_id,
    scope_label: run.scopeLabel || fallbackPlan.scope_label,
    status: run.planStatus === "ready" ? "ready" : fallbackPlan.status,
    timezone: run.timezone || fallbackPlan.timezone,
    focus_strategy: run.focusStrategy || run.planSummary || fallbackPlan.focus_strategy,
  };
}
