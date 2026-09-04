import { parseISO, format, subDays } from 'date-fns';
import { extractLeadingEmoji } from '@/lib/emoji';
import { Todo } from '@/hooks/useTodos';
import { Moment } from '@/types';
import { ImportedEvent } from '@/hooks/useImportedEvents';
import { PLAN_TIMELINE_WAKE_TOTAL_MIN as WAKE_TOTAL_MIN } from '@/lib/planTimelineDayBounds';
import { TimeBlock, getTagIcon } from './planTimelinePrimitives';
import { buildStepSegmentsByParent } from '@/lib/stepTimelineSegments';

const DAY_MIN = 1440; // 24:00 — end of a calendar day on the timeline axis

/** Returns yyyy-MM-dd for the given ISO string (or null). Used to check whether
 *  a timestamp belongs to the calendar day this timeline is rendering — a stale
 *  cross-midnight timer or a plan slot filed under the wrong day must not paint
 *  ghost blocks on other days. */
function isoDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = parseISO(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'yyyy-MM-dd');
}

function intervalOverlapOnDay(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  dayKey: string | undefined,
): { startMin: number; endMin: number } | null {
  if (!startIso || !endIso || !dayKey) return null;
  const start = parseISO(startIso).getTime();
  const end = parseISO(endIso).getTime();
  const dayStart = new Date(`${dayKey}T00:00:00`).getTime();
  const dayEnd = dayStart + DAY_MIN * 60_000;
  if (![start, end, dayStart].every(Number.isFinite) || start >= dayEnd || end <= dayStart) return null;
  return {
    startMin: Math.max(0, Math.floor((start - dayStart) / 60_000)),
    endMin: Math.min(DAY_MIN, Math.ceil((end - dayStart) / 60_000)),
  };
}

/** Given a session's start-minute (relative to its own calendar day) and the
 *  raw ISO start + end timestamps, compute the end-minute on the same continuous
 *  axis. Uses the real elapsed duration between the two ISO timestamps rather
 *  than the naive `endWallClock <= startWallClock ? +1440` heuristic — which
 *  silently added a full day whenever `plan_ended_at` / `timer_ended_at` sat on
 *  a later calendar day with earlier wall-clock hours (e.g. start 23:00 day N,
 *  end 22:00 day N+1 → wrap to 22:00 day N+1 continuous = ~23h). That phantom
 *  survived clampToMidnight but leaked into next-day's tail via makeTail as a
 *  near-24h "ghost" block. Caps duration at DAY_MIN so multi-day corruption
 *  never bleeds across the timeline. Returns undefined if the timestamps are
 *  invalid or the end sits before the start. */
function endMinFromDuration(startMin: number, startIso: string, endIso: string): number | undefined {
  const s = parseISO(startIso);
  const e = parseISO(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return undefined;
  const durationMin = Math.round((e.getTime() - s.getTime()) / 60000);
  if (durationMin <= 0) return undefined;
  return startMin + Math.min(durationMin, DAY_MIN);
}

/** A session may run past midnight (endMin > 1440 via the +1440 wrap below).
 *  On the day it started, clamp its end to 00:00 so nothing spills below the
 *  axis; the remainder is shown as a tail on the next day (see makeTail). */
function clampToMidnight(b: TimeBlock): TimeBlock {
  const crosses =
    b.endMin > DAY_MIN ||
    (b.planEndMin ?? 0) > DAY_MIN ||
    (b.actualEndMin ?? 0) > DAY_MIN;
  if (!crosses) return b;
  return {
    ...b,
    endMin: Math.min(b.endMin, DAY_MIN),
    planEndMin: b.planEndMin != null ? Math.min(b.planEndMin, DAY_MIN) : undefined,
    actualEndMin: b.actualEndMin != null ? Math.min(b.actualEndMin, DAY_MIN) : undefined,
    continuesNextDay: true,
  };
}

/** If a previous-day block crosses midnight, return its post-midnight portion
 *  remapped onto the current day as a read-only tail block. Two shapes:
 *  - **Live** (`isLive=true`, a currently-running timer that started yesterday):
 *    preserves the block's original wall-clock start as a NEGATIVE minute so
 *    the timeline can extend its axis above 00:00 and render the block as one
 *    continuous strip bridging 23:xx → 00:xx.
 *  - **Completed** cross-midnight session (no active timer): clamp startMin
 *    to 0 so the tail sits entirely on today's canvas (00:00 → end-1440) and
 *    the axis stays at today's 00:00 — extending it would leave a blank row
 *    above the tail (nothing else to fill yesterday's late hours). */
function makeTail(b: TimeBlock, isLive: boolean): TimeBlock | null {
  if (b.endMin <= DAY_MIN) return null; // did not cross midnight
  const planCrosses = b.planEndMin != null && b.planEndMin > DAY_MIN;
  const actualCrosses = b.actualEndMin != null && b.actualEndMin > DAY_MIN;
  const shiftedStart = b.startMin - DAY_MIN;
  const shiftedPlanStart = b.planStartMin != null ? b.planStartMin - DAY_MIN : undefined;
  const shiftedActualStart = b.actualStartMin != null ? b.actualStartMin - DAY_MIN : undefined;
  return {
    ...b,
    id: `tail-${b.id}`,
    startMin: isLive ? shiftedStart : Math.max(0, shiftedStart),
    endMin: Math.max(5, b.endMin - DAY_MIN),
    planStartMin: isLive
      ? shiftedPlanStart
      : (shiftedPlanStart != null ? Math.max(0, shiftedPlanStart) : undefined),
    planEndMin: planCrosses ? b.planEndMin! - DAY_MIN : (b.planEndMin != null ? b.planEndMin - DAY_MIN : undefined),
    actualStartMin: isLive
      ? shiftedActualStart
      : (shiftedActualStart != null ? Math.max(0, shiftedActualStart) : undefined),
    actualEndMin: actualCrosses ? b.actualEndMin! - DAY_MIN : (b.actualEndMin != null ? b.actualEndMin - DAY_MIN : undefined),
    hasActual: actualCrosses ? b.hasActual : false,
    sessionGroupKey: undefined, // don't connect the tail to same-session gap chrome
    continuedFromPrevDay: true,
    readOnly: true,
  };
}

/** Build the timeline blocks for a single calendar day. Cross-midnight sessions
 *  are clamped to 00:00; the previous day's cross-midnight remainder is folded
 *  in as early-morning tail blocks. Pure. `dayKey` (yyyy-MM-dd) selects which
 *  calendar day is being rendered — any todo whose timestamps land on other
 *  days is skipped, so a stale timer left running past midnight doesn't leak
 *  a ghost block onto a day the user wasn't actually working on. */
export function buildPlanBlocks(
  todos: Todo[],
  importedEvents: ImportedEvent[] | undefined,
  moments: Moment[],
  activeTimerIds: Set<string> | undefined,
  getTimerElapsed: ((todoId: string) => number) | undefined,
  prevDay?: { todos: Todo[]; moments: Moment[]; importedEvents?: ImportedEvent[] },
  dayKey?: string,
): TimeBlock[] {
  const dayBlocks = buildRawBlocks(todos, importedEvents, moments, activeTimerIds, getTimerElapsed, dayKey)
    .map(clampToMidnight);
  if (!prevDay) return dayBlocks;

  const prevDayKey = dayKey
    ? format(subDays(parseISO(dayKey), 1), 'yyyy-MM-dd')
    : undefined;
  const prevRaw = buildRawBlocks(prevDay.todos, prevDay.importedEvents, prevDay.moments, activeTimerIds, getTimerElapsed, prevDayKey);
  const tails: TimeBlock[] = [];
  prevRaw.forEach(b => {
    // Only a live (still-running) session from yesterday earns a negative
    // startMin — see makeTail for why. Non-todo tails and completed sessions
    // stay clamped to 00:00.
    const isLive = b.source === 'todo' && !!activeTimerIds?.has(b.id);
    const tail = makeTail(b, isLive);
    if (tail) tails.push(tail);
  });
  return [...tails, ...dayBlocks];
}

/** Build raw blocks from a day's records (wall-clock minutes, cross-midnight
 *  ends carried as +1440). Not day-clamped — see buildPlanBlocks. When `dayKey`
 *  is provided, each source's start timestamp must fall on that day (or, for
 *  imports/moments, either the start or end must overlap it) — otherwise the
 *  record is skipped. */
function buildRawBlocks(
  todos: Todo[],
  importedEvents: ImportedEvent[] | undefined,
  moments: Moment[],
  activeTimerIds: Set<string> | undefined,
  getTimerElapsed: ((todoId: string) => number) | undefined,
  dayKey?: string,
): TimeBlock[] {
  const blocks: TimeBlock[] = [];

  // Step work-sessions (each a `step-session`-tagged moment) are grouped by their
  // parent task and rendered as sub-segments INSIDE the parent's block, not as
  // loose standalone moment blocks. Compute the grouping up front so the moment
  // loop can skip them and the todo blocks can attach them.
  const stepSegmentsByParent = buildStepSegmentsByParent(moments, dayKey);

  todos
    .filter(t => !t.is_completed && (t.plan_started_at || t.timer_started_at))
    .filter(t => {
      // Anchor the block to the calendar day of its earliest known start.
      // Prefer plan_started_at when present (that's where the block visually
      // starts); otherwise fall back to timer_started_at. If dayKey is not
      // provided (legacy callers), do no filtering.
      if (!dayKey) return true;
      const anchorDay = isoDayKey(t.plan_started_at) || isoDayKey(t.timer_started_at);
      if (anchorDay === dayKey) return true;
      if (
        intervalOverlapOnDay(t.plan_started_at, t.plan_ended_at, dayKey) ||
        intervalOverlapOnDay(t.timer_started_at, t.timer_ended_at, dayKey)
      ) return true;
      // A timer still running from an earlier day also surfaces on TODAY as a
      // strip from midnight to now — "the thing you're doing right now" belongs
      // where the user is, not only on the day it happened to start. Guarded to
      // the real current day so historical days don't paint a phantom strip.
      const running = !!t.timer_started_at && !t.timer_ended_at && !!activeTimerIds?.has(t.id);
      const todayKey = format(new Date(), 'yyyy-MM-dd');
      return running && dayKey === todayKey && !!anchorDay && anchorDay < dayKey;
    })
    .forEach(t => {
      // Determine plan time range (纯计划也可以出现)
      let planStartMin: number | undefined;
      let planEndMin: number | undefined;
      if (t.plan_started_at) {
        const overlap = intervalOverlapOnDay(t.plan_started_at, t.plan_ended_at, dayKey);
        if (overlap && isoDayKey(t.plan_started_at) !== dayKey) {
          planStartMin = overlap.startMin;
          planEndMin = overlap.endMin;
        } else {
          const pd = parseISO(t.plan_started_at);
          planStartMin = pd.getHours() * 60 + pd.getMinutes();
        }
        if (planEndMin == null && t.plan_ended_at) {
          planEndMin = endMinFromDuration(planStartMin, t.plan_started_at, t.plan_ended_at);
        }
      }

      // Determine actual time range（只有番茄钟/Actual 模式补记后才有）
      let actualStartMin: number | undefined;
      let actualEndMin: number | undefined;
      const hasPendingPlannedRun =
        !!t.plan_started_at &&
        !!t.timer_started_at &&
        !t.timer_ended_at &&
        (t.timer_seconds || 0) === 0 &&
        !activeTimerIds?.has(t.id); // if actively running, always show actual fill

      if (t.timer_started_at && !hasPendingPlannedRun) {
        const d = parseISO(t.timer_started_at);
        const anchorDay = isoDayKey(t.timer_started_at);
        const isRunning = !t.timer_ended_at && !!activeTimerIds?.has(t.id);
        const overlap = intervalOverlapOnDay(t.timer_started_at, t.timer_ended_at, dayKey);
        const isCrossDayRunningToday =
          isRunning && !!dayKey && !!anchorDay && anchorDay < dayKey;
        if (isCrossDayRunningToday) {
          // Started on an earlier day and still running: draw today's slice from
          // midnight up to the current wall-clock minute. It grows live because
          // this rebuilds on each tick. The pre-today portion lives on its own
          // day; here we only show the part that belongs to today.
          const now = new Date();
          actualStartMin = 0;
          actualEndMin = Math.max(5, now.getHours() * 60 + now.getMinutes());
        } else if (overlap && anchorDay !== dayKey) {
          actualStartMin = overlap.startMin;
          actualEndMin = overlap.endMin;
        } else {
          actualStartMin = d.getHours() * 60 + d.getMinutes();
          const liveElapsedSec = activeTimerIds?.has(t.id) && getTimerElapsed ? getTimerElapsed(t.id) : 0;
          let endMin = actualStartMin + 30;
          if (liveElapsedSec > 0) {
            endMin = actualStartMin + Math.ceil(liveElapsedSec / 60);
          } else if (t.timer_ended_at) {
            // Derive from ISO duration so cross-day corruption can't span >24h;
            // fall back to a 30-min default if the timestamps are unusable.
            const derived = endMinFromDuration(actualStartMin, t.timer_started_at, t.timer_ended_at);
            if (derived != null) endMin = derived;
          } else if (t.timer_seconds && t.timer_seconds > 0) {
            endMin = actualStartMin + Math.ceil(t.timer_seconds / 60);
          }
          actualEndMin = endMin;
        }
      }

      const hasPlan = planStartMin !== undefined;
      const hasActual = actualStartMin !== undefined;

      // 如果只有计划，用计划时间；如果有 actual，就按 plan/actual 包络算容器高度
      const basePlanStart = planStartMin ?? actualStartMin ?? WAKE_TOTAL_MIN;
      const basePlanEnd = planEndMin ?? (actualEndMin ?? (basePlanStart + 30));
      const baseActualStart = actualStartMin ?? basePlanStart;
      const baseActualEnd = actualEndMin ?? basePlanEnd;

      const blockStart = hasPlan && hasActual ? Math.min(basePlanStart, baseActualStart) : (hasPlan ? basePlanStart : baseActualStart);
      const blockEnd = hasPlan && hasActual ? Math.max(basePlanEnd, baseActualEnd) : (hasPlan ? basePlanEnd : baseActualEnd);

      blocks.push({
        id: t.id,
        title: t.title,
        startMin: blockStart,
        endMin: Math.max(blockEnd, blockStart + 10),
        type: 'plan',
        source: 'todo',
        tags: t.tags,
        photos: t.photos,
        emoji: extractLeadingEmoji(t.title),
        progress: t.progress,
        planStartMin: hasPlan ? basePlanStart : undefined,
        planEndMin: hasPlan ? Math.max(basePlanEnd, basePlanStart + 10) : undefined,
        actualStartMin: hasActual ? baseActualStart : undefined,
        actualEndMin: hasActual ? Math.max(baseActualEnd, baseActualStart + 10) : undefined,
        hasActual,
        sessionGroupKey: `todo-session:${t.id}`,
      });
    });

  // Completed todos with time
  todos
    .filter(t => t.is_completed && (t.timer_started_at || t.plan_started_at))
    .filter(t => {
      if (!dayKey) return true;
      const anchorDay = isoDayKey(t.plan_started_at) || isoDayKey(t.timer_started_at);
      return (
        anchorDay === dayKey ||
        !!intervalOverlapOnDay(t.plan_started_at, t.plan_ended_at, dayKey) ||
        !!intervalOverlapOnDay(t.timer_started_at, t.timer_ended_at, dayKey)
      );
    })
    .forEach(t => {
      let planStartMin: number | undefined;
      let planEndMin: number | undefined;
      if (t.plan_started_at) {
        const overlap = intervalOverlapOnDay(t.plan_started_at, t.plan_ended_at, dayKey);
        if (overlap && isoDayKey(t.plan_started_at) !== dayKey) {
          planStartMin = overlap.startMin;
          planEndMin = overlap.endMin;
        } else {
          const pd = parseISO(t.plan_started_at);
          planStartMin = pd.getHours() * 60 + pd.getMinutes();
        }
        if (planEndMin == null && t.plan_ended_at) {
          planEndMin = endMinFromDuration(planStartMin, t.plan_started_at, t.plan_ended_at);
        }
      }

      // Plan-only completion: never used the timer, just marked done
      if (!t.timer_started_at) {
        const planStart = planStartMin!;
        const planEnd = planEndMin ?? (planStart + 30);
        blocks.push({
          id: t.id,
          title: t.title,
          startMin: planStart,
          endMin: Math.max(planEnd, planStart + 5),
          type: 'plan',
          source: 'todo',
          isCompleted: true,
          tags: t.tags,
          photos: t.photos,
          emoji: extractLeadingEmoji(t.title),
          progress: t.progress,
          planStartMin: planStart,
          planEndMin: Math.max(planEnd, planStart + 5),
          hasActual: false,
          sessionGroupKey: `todo-session:${t.id}`,
        });
        return;
      }

      const actualOverlap = intervalOverlapOnDay(t.timer_started_at, t.timer_ended_at, dayKey);
      const actualStartsBeforeDay = isoDayKey(t.timer_started_at) !== dayKey;
      const d = parseISO(t.timer_started_at!);
      const startMin = actualOverlap && actualStartsBeforeDay
        ? actualOverlap.startMin
        : d.getHours() * 60 + d.getMinutes();
      let endMin = actualOverlap && actualStartsBeforeDay
        ? actualOverlap.endMin
        : startMin + 5;
      if (!(actualOverlap && actualStartsBeforeDay) && t.timer_ended_at) {
        const derived = endMinFromDuration(startMin, t.timer_started_at!, t.timer_ended_at);
        if (derived != null) endMin = derived;
      } else if (!(actualOverlap && actualStartsBeforeDay) && t.timer_seconds && t.timer_seconds > 0) {
        endMin = startMin + Math.ceil(t.timer_seconds / 60);
      }

      // Capture whether a REAL plan exists BEFORE we apply any fallback.
      // Without this, a completed todo that was only timed (never dragged
      // into a plan slot) would still get phantom plan bounds equal to
      // the actual bounds — and render with both a dashed plan outline
      // AND the solid actual fill, even though the user never planned it.
      const hadRealPlan = planStartMin != null;
      const planStart = planStartMin ?? startMin;
      const planEnd = planEndMin ?? endMin;
      const blockStart = hadRealPlan ? Math.min(planStart, startMin) : startMin;
      const blockEnd = hadRealPlan ? Math.max(planEnd, endMin) : endMin;

      blocks.push({
        id: t.id,
        title: t.title,
        startMin: blockStart,
        endMin: Math.max(blockEnd, blockStart + 5),
        type: 'plan',
        source: 'todo',
        isCompleted: true,
        tags: t.tags,
        photos: t.photos,
        emoji: extractLeadingEmoji(t.title),
        progress: t.progress,
        // Only emit plan bounds when a plan ACTUALLY existed. Otherwise
        // leave undefined so `hasPlan` in the renderer evaluates false
        // and the dashed plan box is suppressed (actual-only block).
        planStartMin: hadRealPlan ? planStart : undefined,
        planEndMin: hadRealPlan ? Math.max(planEnd, planStart + 5) : undefined,
        actualStartMin: startMin,
        actualEndMin: Math.max(endMin, startMin + 5),
        hasActual: true,
        sessionGroupKey: `todo-session:${t.id}`,
      });
    });

  // Imported events
  (importedEvents || []).forEach(ev => {
    const d = new Date(ev.start_time);
    if (dayKey && format(d, 'yyyy-MM-dd') !== dayKey) return;
    const startMin = d.getHours() * 60 + d.getMinutes();
    let endMin = startMin + 60;
    if (ev.end_time) {
      const derived = endMinFromDuration(startMin, ev.start_time, ev.end_time);
      if (derived != null) endMin = derived;
    }
    blocks.push({
      id: `imported-${ev.id}`,
      title: ev.title,
      startMin,
      endMin: Math.max(endMin, startMin + 15),
      type: 'plan',
      source: 'imported',
      emoji: '📅',
      isCompleted: ev.is_completed,
    });
  });

  // Moments with time. Focus-session moments tagged `todo-session:<id>` are
  // emitted as standalone session blocks rather than being merged into the
  // parent todo's actual envelope — see the moments forEach below.

  // Todo ids that already have their own block emitted above. Focus-session
  // moments carrying `todo-session:<id>` for one of these would render as a
  // second small block on top of the parent (same time range, side-by-side
  // column split → visual noise + title collision). The parent block already
  // shows the actual/completed span; the extra moment adds nothing but chrome.
  const todoIdsWithBlock = new Set(blocks.filter(b => b.source === 'todo').map(b => b.id));

  moments.forEach(m => {
    if (!m.timer_started_at) return;
    // Step-session moments are rendered as sub-segments inside their parent
    // task's block (see stepSegmentsByParent + attach pass below), so don't emit
    // them as loose standalone blocks here.
    if (m.tags?.includes('step-session')) return;
    const d = parseISO(m.timer_started_at);
    if (dayKey && format(d, 'yyyy-MM-dd') !== dayKey) return;
    const startMin = d.getHours() * 60 + d.getMinutes();
    let endMin = startMin + 5;
    if (m.timer_ended_at) {
      const derived = endMinFromDuration(startMin, m.timer_started_at, m.timer_ended_at);
      if (derived != null) endMin = derived;
    }
    const sessionGroupKey = m.tags?.find(tag => tag.startsWith('todo-session:'));
    const isFocusSession = !!m.tags?.includes('focus-session');
    // Suppress focus-session moments whose parent todo already has a block —
    // the parent covers the same work window and gets the deviation/plan/actual
    // chrome. Emitting a duplicate moment block splits the column and stacks
    // two titles on top of each other.
    if (isFocusSession && sessionGroupKey) {
      const parentId = sessionGroupKey.slice('todo-session:'.length);
      if (todoIdsWithBlock.has(parentId)) return;
    }

    // Focus-session moments belong to the SAME work as their parent todo —
    // but we deliberately render them as separate blocks rather than merging
    // them into the parent envelope. Previously we collapsed each session into
    // parent.actualStart/End via min/max, which painted the gap BETWEEN
    // sessions (pause / continue-later wait) as continuous "actual" fill —
    // a 1h-work + 2h-pause + 1h-work task showed up as a single 4h slab and
    // overflowed the timeline viewport. Keeping each session as its own block
    // gives the natural "two work strips with empty space between" reading
    // the user expects, and the parent todo's live actual fill (if it's
    // currently running) keeps tracking only the current session.
    blocks.push({
      id: `moment-${m.id}`,
      title: m.text || m.emoji || 'Moment',
      startMin,
      endMin: Math.max(endMin, startMin + 5),
      type: 'plan',
      emoji: m.emoji || (isFocusSession ? getTagIcon(m.tags, m.text || undefined) : undefined),
      source: 'moment',
      isCompleted: isFocusSession,
      photos: m.photos,
      tags: m.tags,
      sessionGroupKey,
    });
  });

  // Attach step sub-segments to their parent task's block, extending the block's
  // envelope to span the sessions. A parent whose ONLY signal is finished step
  // work (no plan, no own timer) has no block yet — synthesize one so the work
  // is still visible, spanning the union of its sessions.
  if (stepSegmentsByParent.size > 0) {
    const blockById = new Map(blocks.map(b => [b.id, b]));
    stepSegmentsByParent.forEach((grp, parentId) => {
      const existing = blockById.get(parentId);
      if (existing) {
        existing.stepSegments = grp.segments;
        existing.startMin = Math.min(existing.startMin, grp.unionStartMin);
        existing.endMin = Math.max(existing.endMin, grp.unionEndMin);
        existing.actualStartMin = Math.min(existing.actualStartMin ?? grp.unionStartMin, grp.unionStartMin);
        existing.actualEndMin = Math.max(existing.actualEndMin ?? grp.unionEndMin, grp.unionEndMin);
        existing.hasActual = true;
        return;
      }
      const parent = todos.find(t => t.id === parentId);
      if (!parent) return;
      blocks.push({
        id: parentId,
        title: parent.title,
        startMin: grp.unionStartMin,
        endMin: Math.max(grp.unionEndMin, grp.unionStartMin + 10),
        type: 'plan',
        source: 'todo',
        isCompleted: parent.is_completed,
        tags: parent.tags,
        photos: parent.photos,
        emoji: extractLeadingEmoji(parent.title),
        progress: parent.progress,
        actualStartMin: grp.unionStartMin,
        actualEndMin: Math.max(grp.unionEndMin, grp.unionStartMin + 10),
        hasActual: true,
        sessionGroupKey: `todo-session:${parentId}`,
        stepSegments: grp.segments,
      });
    });
  }

  // Deduplicate by id
  const seen = new Set<string>();
  return blocks.filter(b => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
}
