import type { KaiExecutionBlock, KaiExecutionPlan, KaiUserProfile } from "@/lib/kai-prompt";
import type { BrowserSupabaseClient } from "@/lib/supabase";

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
};

type SupabaseErrorLike = {
  message: string;
};

type SingleRowResult<Row> = Promise<{
  data: Row | null;
  error: SupabaseErrorLike | null;
}>;

type MutationResult = Promise<{
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

function plannerRunsTable(supabase: BrowserSupabaseClient) {
  return supabase.from("planner_runs" as never) as unknown as PlannerRunsTable;
}

function plannerBlocksInsertTable(supabase: BrowserSupabaseClient) {
  return supabase.from("planner_blocks" as never) as unknown as PlannerBlocksInsertTable;
}

function plannerBlocksUpdateTable(supabase: BrowserSupabaseClient) {
  return supabase.from("planner_blocks" as never) as unknown as PlannerBlocksUpdateTable;
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
    },
  };
}

export async function saveExecutionPlan({
  supabase,
  userId,
  providerLabel,
  profile,
  sourcePrompt,
}: SaveExecutionPlanInput): Promise<SaveExecutionPlanResult> {
  const executionPlan = profile.execution_plan;
  if (!executionPlan || !executionPlan.blocks?.length) {
    throw new Error("No execution plan is available to save.");
  }

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
    raw_profile: profile,
  };

  const plannerRuns = plannerRunsTable(supabase);
  const plannerBlocks = plannerBlocksInsertTable(supabase);

  const { data: runData, error: runError } = await plannerRuns
    .insert(runPayload)
    .select("id")
    .single();

  if (runError || !runData?.id) {
    throw runError || new Error("Planner run could not be saved.");
  }

  const blockPayload = executionPlan.blocks.map((block, index) => ({
    run_id: runData.id,
    ...normalizeBlock(block, index),
  }));

  const { error: blockError } = await plannerBlocks.insert(blockPayload);
  if (blockError) {
    throw blockError;
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
}: UpdateExecutionBlockStatusInput) {
  const plannerBlocks = plannerBlocksUpdateTable(supabase);

  const { error } = await plannerBlocks
    .update({ status })
    .eq("run_id", runId)
    .eq("block_key", blockId);

  if (error) {
    throw error;
  }
}

export function buildLocalExecutionPlan(profile: KaiUserProfile | null): KaiExecutionPlan | null {
  if (!profile?.execution_plan?.blocks?.length) {
    return null;
  }

  return {
    ...profile.execution_plan,
    blocks: profile.execution_plan.blocks.map((block, index) => ({
      ...block,
      id: block.id || `block_${index + 1}`,
      status: block.status || "pending",
      can_skip: typeof block.can_skip === "boolean" ? block.can_skip : true,
      notes: block.notes || null,
      source_goal: block.source_goal || null,
    })),
  };
}
