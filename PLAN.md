# Tablet-Friendly Weekly Planner — Execution Plan

## 1) Requirements

- Week starts on **Monday**.
- Weekly view includes **7 days**: Mon–Sun.
- Each day shows hourly time slots from **06:00 to 22:00**.
- Users can add text events that **snap to the hour grid**.
- Event duration is in **1-hour increments** (minimum 1 hour), with resize snapping.
- Events support drag-and-drop across day/time with snapping.
- Events can be assigned a color.
- Tablet UX is a priority, including **two-finger pinch zoom**:
  - vertical zoom (time-slot height)
  - horizontal zoom (day-column width)
- Overlapping events are rendered **side-by-side** (no visual overlap on top of each other).
- No persistence in initial release (refresh resets state).
- Libraries are allowed when they reduce complexity/risk.

---

## 2) Suggested Lightweight Architecture

### Data model (in-memory only)
- `CalendarEvent`:
  - `id: string`
  - `title: string`
  - `dayIndex: 0..6` (Mon=0)
  - `startHour: 6..21`
  - `durationHours: >=1`
  - `color: string`
- UI state:
  - `zoomX`, `zoomY`
  - drag/resize draft state

### Rendering approach
- Grid-first layout: time axis (06:00–22:00) + 7 day columns.
- Absolute-position event blocks inside each day column from computed top/height.
- Utility mapping:
  - model → pixels for render
  - pixels → snapped model values for interactions
- Overlap layout pass per day: group intersecting intervals, assign column index/column count, render side-by-side widths.

### Suggested libraries
- **Gesture/zoom**: `@use-gesture/react` + `@react-spring/web` *(if React)*, or `interact.js` *(framework-agnostic)*.
- **Drag/resize/snapping**: `interact.js` (drag + resize + snapping constraints) is a strong all-in-one option.

---

## 3) PR-by-PR Roadmap (each PR independently testable)

## PR 1 — Weekly grid foundation
**Scope**
- Create planner shell with Monday-first, 7-column week view.
- Render hour slots 06:00–22:00 and sticky day headers/time gutter.
- Add tablet-oriented base styling.

**Implementation notes**
- Build static grid and constants (`DAYS`, `START_HOUR`, `END_HOUR`).
- Keep layout math centralized for later drag/resize/zoom work.

**Acceptance criteria**
- UI shows Mon–Sun columns and hourly rows from 06 to 22.
- Layout is readable on tablet portrait and landscape.

---

## PR 2 — Event model + create event
**Scope**
- Add in-memory event store and “create event” flow.
- Render events snapped to hour boundaries with default 1-hour duration.
- Add color selection at creation (preset palette).

**Implementation notes**
- Add a simple modal/panel form for title/day/start/duration/color.
- Render is fully derived from model values.

**Acceptance criteria**
- User can add event text and color; event appears in correct day/hour slot.
- Refresh clears all events (no persistence).

---

## PR 3 — Drag-and-drop with snap
**Scope**
- Implement drag interactions for moving events across day/time.
- Snap dropped position to nearest valid hour/day slot.

**Implementation notes**
- Use pointer-driven drag (or chosen library drag support).
- Clamp within planner bounds and valid hours.

**Acceptance criteria**
- Dragging updates event day/start time only in snapped 1-hour increments.
- Event cannot be dropped outside Mon–Sun or 06:00–22:00 bounds.

---

## PR 4 — Resize with snap and constraints
**Scope**
- Add resize handle(s) for event duration changes.
- Snap duration to whole hours, min 1 hour.

**Implementation notes**
- Resize from bottom edge first (top edge optional later).
- Enforce end-time cap at 22:00.

**Acceptance criteria**
- User can resize event in 1-hour increments.
- Duration never goes below 1 hour and never exceeds day-range limits.

---

## PR 5 — Overlap layout engine (side-by-side)
**Scope**
- Detect overlapping intervals within each day.
- Render overlaps in columns side-by-side with spacing.

**Implementation notes**
- Build interval grouping + column assignment algorithm.
- Keep algorithm pure/testable (input events → layout metadata).

**Acceptance criteria**
- Overlapping events are visible side-by-side, not visually stacked on top of each other.
- Non-overlapping events keep full available width.

---

## PR 6 — Tablet pinch zoom (X + Y)
**Scope**
- Add two-finger pinch zoom for both horizontal and vertical scaling.
- Ensure grid and events stay aligned during/after zoom.

**Implementation notes**
- Maintain independent `zoomX` and `zoomY` with min/max bounds.
- Recompute dimensions from base sizes × zoom scales.

**Acceptance criteria**
- Pinch gesture zooms day width and hour height smoothly.
- Drag/resize snapping remains correct after zooming.

---

## PR 7 — Interaction polish and hardening
**Scope**
- Improve touch hit targets and interaction feedback.
- Add edge-case handling and regression checks.

**Implementation notes**
- Visual states for selected/dragging/resizing.
- Handle fast repeated interactions and cancel paths.

**Acceptance criteria**
- Planner interactions are stable on tablet.
- Core flows (create, color, drag, resize, overlap, zoom) all work together without breaking snapping.
