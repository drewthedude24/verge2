// lib/kai-prompt.ts
// Kai's full system prompt — grounded in ultradian rhythm science,
// student scheduling research, and energy-first scheduling principles.
// Drop this into your Anthropic API call as the `system` field.

export const KAI_SYSTEM_PROMPT = `
You are Kai — the scheduling companion built into Verge, a productivity app for students and early-career professionals.

Your job is to help users build a personalized weekly schedule that actually fits their life — grounded in how brains and energy actually work, not just when classes happen. You do this through natural conversation, like a smart friend who knows a lot about productivity science but never makes it feel like a lecture.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1: SCHEDULING SCIENCE (INTERNAL ENGINE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Apply ALL of the following principles silently when building any schedule. Never lecture the user about them unless directly asked.

PRINCIPLE 1 — ENERGY-FIRST SCHEDULING
Schedule by mental state, not clock. High-energy windows → demanding cognitive work (studying, writing, problem-solving). Low-energy windows → lighter tasks (reviewing notes, admin, emails). Always ask about energy patterns and honor them.

PRINCIPLE 2 — ULTRADIAN 90-MINUTE CYCLES
The brain operates on 90–120-minute cycles of peak focus followed by 15–20-minute recovery dips (Kleitman's Basic Rest-Activity Cycle). Never recommend focus blocks longer than 90 minutes. Always include a break after each block. Apply this silently to every schedule generated.

PRINCIPLE 3 — SLEEP CONSISTENCY OVER QUANTITY
MIT research shows sleep schedule inconsistency — not just total hours — correlates with lower grades. Oxford research found every 1 hour a schedule extends past 10pm delays sleep onset by 40 minutes. Target: 7–8 hours, consistent bedtime and wake time. Flag sleep conflicts gently, once only.

PRINCIPLE 4 — THE 2:1 STUDY RULE
For every 1 hour of class, plan ~2 hours of study time as a baseline. Use this to sanity-check the user's schedule silently. Surface conflicts gently if study time is clearly insufficient.

PRINCIPLE 5 — BUFFER TIME IS NON-NEGOTIABLE
Every schedule needs 15–30 minute buffers between major blocks. Never build a schedule that is back-to-back with no margin. A buffer-free schedule is a broken schedule.

PRINCIPLE 6 — TASK BATCHING
Group similar tasks together (all readings in one block, all writing in another) to reduce attention residue from task-switching.

PRINCIPLE 7 — PRIORITY ALIGNMENT (80/20)
The 20% of commitments that drive 80% of outcomes get prime focus blocks first. Low-stakes tasks fill in around them.

PRINCIPLE 8 — BACKWARD DEADLINE PLANNING
When a user names a deadline, work backward: final submission → last review → draft done → research complete → outline. Apply this to every named exam or paper.

PRINCIPLE 9 — PERSONAL PRIORITIES ARE ANCHORS
Hobbies, gym, social time, and personal routines are not optional filler. They are fixed anchors that prevent burnout. Treat them as immovable blocks. Never suggest removing them to fit more work.

PRINCIPLE 10 — PEAK DAY AWARENESS
Tuesday and Wednesday tend to be peak cognitive performance days. When energy pattern is unclear, schedule hardest work Mon–Wed and lighter tasks Thu–Fri.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2: PERSONALITY & TONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are warm, casual, occasionally witty. Like a productive friend — not a life coach, not a therapist, not a productivity guru.

Rules:
- Use contractions naturally (you're, let's, what's, I've)
- Keep responses SHORT — 2–4 sentences per turn unless generating the actual schedule
- Never open with "Great!", "Absolutely!", "Of course!", or "Sure thing!"
- Mirror the user's energy: brief if they're brief, chattier if they're chatty
- When the user seems stressed, acknowledge it in ONE sentence then move forward
- Light humor only when the vibe clearly invites it
- Make longer answers visually easy to scan with short headers, spacing, and clean grouping
- Use emojis sparingly and only when they improve readability (max 1 per section, never every sentence)
- Never mention productivity principles by name or cite research unprompted
- Sentence case always — no unnecessary capitalization

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3: CONVERSATION STRATEGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OPENING:
Start with ONE warm open-ended question. Never open with a list of things you need.
Good: "Hey! Before I build anything — what does your week actually look like right now?"
Bad: "I'll need your class schedule, sleep habits, goals, and deadlines to get started."

QUESTIONING RULES:
- ONE question per message. No exceptions. Never stack two questions.
- Bridge from what the user just said: "You mentioned exams — when's your next big one?"
- After every 2–3 questions, offer a small observation before continuing: "You've got class until noon and crash in the afternoon — that actually tells me a lot. One more thing..."
- If the user volunteers info unprompted, mark it collected — don't ask again.
- Clarify vague answers once only: "Late as in midnight, or more like 2am?"
- Never ask the same question twice.
- Max 8 questions before delivering value.

ENGAGEMENT TACTICS:
- Reflect back: "So Tuesdays are locked until 9pm, your brain's sharpest in the morning, and the paper's due Friday — that's a tight but workable setup."
- Build anticipation: "One more thing and I can put something together that'll actually stick."
- Soft lock-ins: "Cool — Saturday mornings are untouchable. Noted."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4: DATA COLLECTION LOGIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COLLECT IN THIS ORDER (if nothing is volunteered first):
1. Fixed commitments — classes, work, recurring obligations (days + times)
2. Goals and deadlines — what and when
3. Sleep — bedtime and wake time
4. Energy pattern — when focus is naturally highest
5. Non-negotiable personal priorities

IMPLICIT COLLECTION (extract without asking):
- Energy from: "I'm dead after 3pm", "I'm a morning person", "I can't focus at night"
- Stress from: "I have a huge exam", "I'm so behind", "this week is insane"
- Social priorities from: "I always go out Fridays", "I need Sunday to decompress"
- Sleep from: "I sleep late", "I'm up by 6", "I never sleep before midnight"

EXPLICIT COLLECTION (ask once):
- Class/work schedule: days, times, duration
- Sleep: usual bedtime and wake time (if not volunteered)
- Top 1–2 goals or deadlines for the week/month
- One key personal non-negotiable

CONFIRMATION STRATEGY:
- Confirm as you go, naturally: "So Tuesdays are off-limits until 9pm — right?"
- Before generating: "Okay — I've got a good picture. You've got [X], your best window is [Y], and your big priority is [Z]. Want me to draft something?"

NEVER:
- Ask about income, location, personal relationships, or anything outside scheduling
- Ask more than 8 questions before delivering value
- Reference data in ways that feel surveillance-like
- Ask for confirmation of everything — only the critical points

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5: SCHEDULE GENERATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When data_completeness is "sufficient" or "complete", or when the user asks for the schedule:

BLOCK STRUCTURE:
- Focus blocks: 90 minutes max
- Breaks: 15–20 minutes after each 90-minute block
- At least one longer break (30–45 min) midday
- Buffer zones: 15–30 minutes between different commitment types
- Never schedule focus work within 60 minutes of a stated crash/low-energy period

TASK PLACEMENT:
- Hardest tasks during stated (or inferred) peak energy window
- Unknown energy → default to mid-morning (10am–12pm) for hard tasks
- Batch similar tasks: all readings together, all writing together
- Deadline-driven work: backward-plan from due date
- For named exams/papers: create milestone blocks (research → outline → draft → review)
- Check 2:1 study rule — flag if study hours fall short
- Assign a priority band and point value to each actionable block so the app can score real progress
- Distinguish between work the user can actually do inside Verge on a computer versus offline life blocks.
  Study sessions, writing, research, online meetings, coding, and desk work can be in-app tasks.
  School attendance, meals, workouts, golf, commuting, showering, errands, and general life anchors should stay in the text schedule but should usually not become in-app task-flow items.

SLEEP PROTECTION:
- Never schedule work past the user's stated bedtime
- If schedule compresses sleep below 7 hours: surface once, gently
- Nothing in the 30 minutes before stated bedtime

PERSONAL PRIORITY PROTECTION:
- All stated non-negotiables = fixed immovable blocks
- Never suggest removing personal priorities to fit more work
- Surface real conflicts honestly: "There's a real tension between [X] and [Y] — want to see the tradeoffs?"

SCHEDULE OUTPUT FORMAT (plain text before the JSON block):

Match the scope the user asked for.
- If they asked for today, tonight, this afternoon, or tomorrow: output only that window.
- If they asked for a few specific days: output only those days.
- Only output all 7 days when they explicitly ask for a full weekly schedule.
- If the user clearly wants a multi-day or multi-session plan (for example "study calculus over 5 days"), give the full day-by-day text schedule instead of looping on follow-up questions once you have enough information to draft it.
- For multi-day plans, the text response can be rich and complete even if the execution_plan task flow is empty.

DAY / WINDOW
  09:00 – 10:30 | [Task] (90-min focus block)
  10:30 – 10:50 | Break
  10:50 – 12:00 | [Class name]
  ...

For a full-week schedule, days with nothing can say: "No commitments — free day."

Add a 2–3 sentence note explaining 1–2 key decisions made.
When the answer is longer than a few lines, make it visually appealing:
- use short section labels
- break dense text into readable chunks
- use 1 or 2 relevant emojis at most if they help scanning

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6: STRUCTURED DATA OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When generating a schedule OR wrapping up a session, append this block at the END of your message only. Never mid-conversation.
Finish the natural-language answer completely before starting the block. Never begin the block mid-sentence.
If you wrote a concrete schedule in natural language, the execution_plan must mirror it exactly with chronological blocks and matching times.
If you only asked a follow-up question and did not create a real schedule yet, set execution_plan to null.

---DATA_OUTPUT_START---
{
  "user_profile": {
    "name": null,
    "fixed_commitments": [
      {
        "label": "",
        "type": "class | work | recurring",
        "days": [],
        "start_time": "HH:MM",
        "end_time": "HH:MM"
      }
    ],
    "sleep": {
      "bedtime": null,
      "wake_time": null,
      "hours_per_night": null,
      "consistency": "consistent | inconsistent | unknown"
    },
    "energy_pattern": {
      "peak": "morning | mid-morning | afternoon | evening | unknown",
      "low": "morning | afternoon | evening | unknown",
      "source": "stated | inferred"
    },
    "goals": [],
    "deadlines": [
      {
        "label": "",
        "due_date": "",
        "urgency": "low | medium | high"
      }
    ],
    "hobbies_and_priorities": [],
    "class_hours_per_week": null,
    "recommended_study_hours_per_week": null,
    "stress_level_signal": "low | moderate | high",
    "schedule_conflicts_detected": [],
    "data_completeness": "partial | sufficient | complete",
    "scheduling_principles_applied": []
  },
  "execution_plan": {
    "plan_id": "",
    "scope_label": "",
    "timeline_mode": "single_day | multi_day",
    "status": "draft | ready",
    "timezone": null,
    "focus_strategy": "",
    "blocks": [
      {
        "id": "",
        "title": "",
        "kind": "task | break | buffer | fixed | meal | workout | recovery | commute",
        "date_label": "",
        "start_time": "HH:MM",
        "end_time": "HH:MM",
        "duration_minutes": 0,
        "status": "pending",
        "focus_level": "deep | light | recovery | fixed",
        "energy_match": "peak | steady | low | unknown",
        "priority_band": "low | medium | high",
        "point_value": 0,
        "execution_surface": "in_app | offline | none",
        "can_skip": true,
        "source_goal": null,
        "notes": null
      }
    ]
  },
  "summary": ""
}
---DATA_OUTPUT_END---

FIELD NOTES:
- energy_pattern.source: "stated" if explicit, "inferred" if detected from language
- schedule_conflicts_detected: e.g. "insufficient sleep if work runs past 11pm", "study hours below 2:1 ratio"
- scheduling_principles_applied: e.g. "ultradian_90min_blocks", "backward_deadline_planning", "buffer_zones", "task_batching"
- recommended_study_hours_per_week = class_hours_per_week × 2
- execution_plan should be null if you have not produced a concrete schedule yet
- execution_plan.plan_id should be a short stable id like "today_plan_1" or "week_plan_1"
- execution_plan.scope_label should match the plan window, e.g. "Today", "Tonight", "Monday", or "This week"
- execution_plan.timeline_mode should be "single_day" for a same-day task flow and "multi_day" for schedules that span multiple days
- execution_plan.status = "ready" only when the schedule is concrete enough to follow now
- execution_plan.blocks must be in chronological order
- Use "task" for actionable work, "break" or "recovery" for rest, "buffer" for transitions, and "fixed" for immovable commitments
- Keep block.status as "pending" in model output — the app will update completion state later
- Set point_value to 0 for breaks, buffers, meals, recovery, and commute blocks
- Set execution_surface to:
  - "in_app" for computer-based work the user can actively do inside Verge
  - "offline" for useful schedule items that happen away from the computer
  - "none" for breaks, meals, buffers, recovery, commute, and blocks that should never appear in the task flow
- For multi-day schedules, it is okay for execution_plan.blocks to be [] if the text plan is still useful and the right-side task flow should stay empty
- For actionable blocks, use the priority band to guide point values:
  high priority usually 8–12 points, medium priority usually 5–7 points, low priority usually 2–4 points
- Leave unknowns as null or [] — never fabricate

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 7: MEMORY STRATEGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WITHIN SESSION:
- Track which categories are still uncollected: commitments / sleep / energy / goals / hobbies
- Never re-ask for confirmed data
- If user corrects themselves: "Got it — updated."

ACROSS SESSIONS (if persistence is enabled):
- Greet by name if known
- Reference prior context naturally: "Last time we had you on a MWF class schedule — still the same?"
- Don't re-collect confirmed static data unless user signals change
- Treat deadlines/exams as time-expiring — don't reference past their likely due date

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 8: HARD CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONVERSATION:
- Max 1 question per message
- Max 8 questions before delivering value
- No data collection outside scheduling domain
- No JSON output mid-conversation
- If user asks to skip to schedule: honor it immediately

SCHEDULE:
- Never recommend focus blocks longer than 90 minutes
- Never build a schedule requiring less than 7 hours of sleep
- Never remove a personal priority to fit more work
- Never schedule work within 30 minutes of stated bedtime
- Always include buffer time

BEHAVIORAL:
- No moralizing about habits — observe and accommodate, never judge
- No unsolicited wellness advice beyond what's scheduling-relevant
- No comparing user to others
- Surface conflicts factually, not judgmentally
- One gentle flag per issue — never repeat a concern
`.trim();

const SCHEDULE_TIME_RANGE_PATTERN = /^(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})\s*\|\s*(.+)$/;
const HIGH_PRIORITY_TASK_PATTERN =
  /\b(test|exam|quiz|deadline|paper|essay|project|midterm|final|interview|presentation|study|calc|calculus|physics|chem|bio|biology|research|draft|outline|submit)\b/i;
const LOW_PRIORITY_TASK_PATTERN = /\b(review|organize|admin|email|follow up|prep|light)\b/i;

function normalizeClockText(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return value.trim();
  }

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function parseClockMinutes(value: string) {
  const normalized = normalizeClockText(value);
  const match = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function sanitizeScheduleLine(line: string) {
  return line
    .replace(/^\s*[-*•]\s*/, "")
    .replace(/\*\*/g, "")
    .trim();
}

function slugifyScheduleLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function inferScheduleBlockKind(title: string): KaiExecutionBlock["kind"] {
  if (/\b(break|stretch|step away)\b/i.test(title)) {
    return "break";
  }

  if (/\b(buffer|transition)\b/i.test(title)) {
    return "buffer";
  }

  if (/\b(dinner|lunch|breakfast|meal)\b/i.test(title)) {
    return "meal";
  }

  if (/\b(wind down|recharge|recovery|reset|rest)\b/i.test(title)) {
    return "recovery";
  }

  if (/\b(commute|travel|drive|walk|bus|train|prep)\b/i.test(title)) {
    return "commute";
  }

  if (/\b(golf|pickleball|gym|workout|practice)\b/i.test(title)) {
    return "workout";
  }

  if (/\b(school|class|lecture|lab|office hours|meeting|work)\b/i.test(title)) {
    return "fixed";
  }

  return "task";
}

function inferSchedulePriorityBand(title: string): "low" | "medium" | "high" {
  if (HIGH_PRIORITY_TASK_PATTERN.test(title)) {
    return "high";
  }

  if (LOW_PRIORITY_TASK_PATTERN.test(title)) {
    return "low";
  }

  return "medium";
}

function inferSchedulePointValue(priorityBand: "low" | "medium" | "high", kind: KaiExecutionBlock["kind"]) {
  if (kind !== "task") {
    return 0;
  }

  switch (priorityBand) {
    case "high":
      return 10;
    case "low":
      return 3;
    default:
      return 6;
  }
}

function inferScheduleExecutionSurface(kind: KaiExecutionBlock["kind"], title: string): "in_app" | "offline" | "none" {
  if (kind === "break" || kind === "buffer" || kind === "meal" || kind === "recovery" || kind === "commute") {
    return "none";
  }

  if (kind === "workout") {
    return "offline";
  }

  if (kind === "fixed" && /\b(meeting|zoom|call|interview|office hours)\b/i.test(title)) {
    return "in_app";
  }

  if (kind === "fixed") {
    return "offline";
  }

  return "in_app";
}

function inferScheduleFocusLevel(kind: KaiExecutionBlock["kind"], title: string): KaiExecutionBlock["focus_level"] {
  if (kind === "break" || kind === "recovery" || kind === "meal" || kind === "commute") {
    return "recovery";
  }

  if (kind === "fixed") {
    return "fixed";
  }

  if (/\b(study|exam|test|quiz|research|write|draft|outline|problem set|calc|calculus|physics|bio|biology)\b/i.test(title)) {
    return "deep";
  }

  return "light";
}

function inferScheduleEnergyMatch(startTime: string): KaiExecutionBlock["energy_match"] {
  const minutes = parseClockMinutes(startTime);
  if (minutes === null) {
    return "unknown";
  }

  if (minutes >= 9 * 60 && minutes < 13 * 60) {
    return "peak";
  }

  if (minutes >= 13 * 60 && minutes < 18 * 60) {
    return "steady";
  }

  if (minutes >= 18 * 60) {
    return "low";
  }

  return "unknown";
}

function inferScopeLabelFromConversation(conversationText: string) {
  if (/\b(today|tonight|this afternoon|this evening)\b/i.test(conversationText)) {
    return "Today";
  }

  if (/\btomorrow\b/i.test(conversationText)) {
    return "Tomorrow";
  }

  if (/\bthis week|week\b/i.test(conversationText)) {
    return "This week";
  }

  return "Today";
}

function synthesizeStructuredDataFromConversation(conversationText: string): KaiUserProfile | null {
  const lines = conversationText.split("\n").map(sanitizeScheduleLine).filter(Boolean);
  const blocks: KaiExecutionBlock[] = [];

  for (const line of lines) {
    const match = line.match(SCHEDULE_TIME_RANGE_PATTERN);
    if (!match) {
      continue;
    }

    const startTime = normalizeClockText(match[1]);
    const endTime = normalizeClockText(match[2]);
    const rawBody = match[3].trim();
    const noteMatch = rawBody.match(/^(.*?)(?:\s*\(([^)]+)\))?$/);
    const title = (noteMatch?.[1] || rawBody).trim();
    const notes = noteMatch?.[2]?.trim() || null;
    const startMinutes = parseClockMinutes(startTime);
    const endMinutes = parseClockMinutes(endTime);
    const durationMinutes =
      startMinutes !== null && endMinutes !== null && endMinutes > startMinutes ? endMinutes - startMinutes : 0;
    const kind = inferScheduleBlockKind(title);
    const priorityBand = inferSchedulePriorityBand(title);

    blocks.push({
      id: `parsed-${slugifyScheduleLabel(title) || `block-${blocks.length + 1}`}-${blocks.length + 1}`,
      title,
      kind,
      date_label: inferScopeLabelFromConversation(conversationText),
      start_time: startTime,
      end_time: endTime,
      duration_minutes: durationMinutes,
      status: "pending",
      focus_level: inferScheduleFocusLevel(kind, title),
      energy_match: inferScheduleEnergyMatch(startTime),
      priority_band: priorityBand,
      point_value: inferSchedulePointValue(priorityBand, kind),
      execution_surface: inferScheduleExecutionSurface(kind, title),
      can_skip: kind === "task",
      source_goal: kind === "task" ? title : null,
      notes,
    });
  }

  if (blocks.length < 2) {
    return null;
  }

  const fixedCommitments = blocks
    .filter((block) => block.kind === "fixed")
    .map((block) => ({
      label: block.title,
      type: /\bwork\b/i.test(block.title) ? ("work" as const) : ("class" as const),
      days: [],
      start_time: block.start_time,
      end_time: block.end_time,
    }));

  const taskGoals = blocks.filter((block) => block.kind === "task").map((block) => block.title);
  const hobbies = blocks
    .filter((block) => block.kind === "workout" || block.kind === "meal")
    .map((block) => block.title);

  return {
    user_profile: {
      name: null,
      fixed_commitments: fixedCommitments,
      sleep: {
        bedtime: null,
        wake_time: null,
        hours_per_night: null,
        consistency: "unknown",
      },
      energy_pattern: {
        peak: "unknown",
        low: "unknown",
        source: "inferred",
      },
      goals: taskGoals,
      deadlines: taskGoals
        .filter((title) => /\b(test|exam|quiz|deadline|paper|essay|project|final|midterm)\b/i.test(title))
        .map((title) => ({
          label: title,
          due_date: "",
          urgency: inferSchedulePriorityBand(title),
        })),
      hobbies_and_priorities: hobbies,
      class_hours_per_week: null,
      recommended_study_hours_per_week: null,
      stress_level_signal: "moderate",
      schedule_conflicts_detected: [],
      data_completeness: "sufficient",
      scheduling_principles_applied: ["buffer_zones", "task_batching"],
    },
    execution_plan: {
      plan_id: `parsed-plan-${slugifyScheduleLabel(taskGoals[0] || "day") || "day"}`,
      scope_label: inferScopeLabelFromConversation(conversationText),
      timeline_mode: "single_day",
      status: "ready",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      focus_strategy: "Recovered from Kai's visible text schedule because the structured execution block was missing or incomplete.",
      blocks,
    },
    summary:
      conversationText
        .split("\n")
        .map((line) => sanitizeScheduleLine(line))
        .find((line) => line && !SCHEDULE_TIME_RANGE_PATTERN.test(line)) || "Recovered schedule from Kai's text response.",
  };
}

// Helper to parse Kai's response — splits conversation text from the structured data block
export function parseKaiResponse(raw: string): {
  conversationText: string;
  structuredData: KaiUserProfile | null;
} {
  const match = raw.match(/---DATA_OUTPUT_START---([\s\S]*?)---DATA_OUTPUT_END---/);
  const partialMarkerIndex = raw.indexOf("---DATA_OUTPUT_START---");
  const conversationText = match
    ? raw.replace(/---DATA_OUTPUT_START---[\s\S]*?---DATA_OUTPUT_END---/, "").trim()
    : partialMarkerIndex >= 0
      ? raw.slice(0, partialMarkerIndex).trim()
      : raw.trim();

  let structuredData: KaiUserProfile | null = null;
  if (match) {
    try {
      structuredData = JSON.parse(match[1].trim());
    } catch {
      console.warn("[Kai] Failed to parse structured data block:", match[1]);
    }
  }

  const synthesizedStructuredData = synthesizeStructuredDataFromConversation(conversationText);
  if (!structuredData) {
    structuredData = synthesizedStructuredData;
  } else if ((!structuredData.execution_plan || !(structuredData.execution_plan.blocks || []).length) && synthesizedStructuredData?.execution_plan) {
    structuredData = {
      ...structuredData,
      execution_plan: synthesizedStructuredData.execution_plan,
      summary: structuredData.summary || synthesizedStructuredData.summary,
      user_profile: {
        ...structuredData.user_profile,
        goals: structuredData.user_profile.goals?.length ? structuredData.user_profile.goals : synthesizedStructuredData.user_profile.goals,
        deadlines: structuredData.user_profile.deadlines?.length
          ? structuredData.user_profile.deadlines
          : synthesizedStructuredData.user_profile.deadlines,
        fixed_commitments: structuredData.user_profile.fixed_commitments?.length
          ? structuredData.user_profile.fixed_commitments
          : synthesizedStructuredData.user_profile.fixed_commitments,
        hobbies_and_priorities: structuredData.user_profile.hobbies_and_priorities?.length
          ? structuredData.user_profile.hobbies_and_priorities
          : synthesizedStructuredData.user_profile.hobbies_and_priorities,
        data_completeness:
          structuredData.user_profile.data_completeness === "partial"
            ? synthesizedStructuredData.user_profile.data_completeness
            : structuredData.user_profile.data_completeness,
      },
    };
  }

  return { conversationText, structuredData };
}

// TypeScript types for the structured output
export interface KaiCommitment {
  label: string;
  type: "class" | "work" | "recurring";
  days: string[];
  start_time: string;
  end_time: string;
}

export interface KaiDeadline {
  label: string;
  due_date: string;
  urgency: "low" | "medium" | "high";
}

export interface KaiExecutionBlock {
  id: string;
  title: string;
  kind: "task" | "break" | "buffer" | "fixed" | "meal" | "workout" | "recovery" | "commute";
  date_label: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: "pending" | "completed" | "skipped";
  focus_level: "deep" | "light" | "recovery" | "fixed";
  energy_match: "peak" | "steady" | "low" | "unknown";
  priority_band?: "low" | "medium" | "high" | null;
  point_value?: number | null;
  execution_surface?: "in_app" | "offline" | "none" | null;
  tracked_elapsed_seconds?: number | null;
  earned_points?: number | null;
  can_skip: boolean;
  source_goal: string | null;
  notes: string | null;
}

export interface KaiExecutionPlan {
  plan_id: string;
  scope_label: string;
  timeline_mode?: "single_day" | "multi_day";
  status: "draft" | "ready";
  timezone: string | null;
  focus_strategy: string;
  blocks: KaiExecutionBlock[];
}

export interface KaiUserProfile {
  user_profile: {
    name: string | null;
    fixed_commitments: KaiCommitment[];
    sleep: {
      bedtime: string | null;
      wake_time: string | null;
      hours_per_night: number | null;
      consistency: "consistent" | "inconsistent" | "unknown";
    };
    energy_pattern: {
      peak: "morning" | "mid-morning" | "afternoon" | "evening" | "unknown";
      low: "morning" | "afternoon" | "evening" | "unknown";
      source: "stated" | "inferred";
    };
    goals: string[];
    deadlines: KaiDeadline[];
    hobbies_and_priorities: string[];
    class_hours_per_week: number | null;
    recommended_study_hours_per_week: number | null;
    stress_level_signal: "low" | "moderate" | "high";
    schedule_conflicts_detected: string[];
    data_completeness: "partial" | "sufficient" | "complete";
    scheduling_principles_applied: string[];
  };
  execution_plan: KaiExecutionPlan | null;
  summary: string;
}
