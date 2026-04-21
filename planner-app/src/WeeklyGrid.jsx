import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DAYS,
  START_HOUR,
  END_HOUR,
  HOUR_COUNT,
  BASE_SLOT_HEIGHT,
  BASE_DAY_WIDTH,
  TIME_GUTTER_WIDTH,
} from './constants';
import { addEvent, getEvents, updateEvent } from './eventStore';
import { computeOverlapLayout } from './overlapLayout';
import './WeeklyGrid.css';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

function clampZoom(value) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
}

const EVENT_COLORS = ['#2563eb', '#9333ea', '#db2777', '#ea580c', '#059669'];

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function getDefaultDayIndex() {
  const today = (new Date().getDay() + 6) % 7;
  return Math.min(Math.max(today, 0), DAYS.length - 1);
}

const INSET = 4; // px gap on each outer edge of an overlap column

export default function WeeklyGrid() {
  const hours = Array.from({ length: HOUR_COUNT }, (_, i) => START_HOUR + i);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [events, setEvents] = useState(() => getEvents());
  const [formState, setFormState] = useState(() => ({
    title: '',
    dayIndex: String(getDefaultDayIndex()),
    startHour: String(START_HOUR),
    durationHours: '1',
    color: EVENT_COLORS[0],
  }));

  // Zoom state — zoomX scales day-column widths, zoomY scales hour-slot heights.
  const [zoom, setZoom] = useState({ x: 1, y: 1 });
  // Ref mirrors state so touch-event handlers (registered once) can read the
  // current zoom without stale closures.
  const zoomRef = useRef({ x: 1, y: 1 });
  useLayoutEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Computed per-render dimensions derived from zoom.
  const slotHeight = BASE_SLOT_HEIGHT * zoom.y;
  const dayWidth = BASE_DAY_WIDTH * zoom.x;

  // Drag state for rendering (ghost + opacity). The ref holds the same value
  // so window listeners can always access the latest without stale closures.
  const [dragState, setDragState] = useState(null);
  const dragRef = useRef(null);
  const bodyRef = useRef(null);
  const plannerRef = useRef(null);

  const isDragging = dragState !== null;

  function setDragAndRef(value) {
    dragRef.current = value;
    setDragState(value);
  }

  // Resize state: tracks the event being resized and the current preview duration.
  const [resizeState, setResizeState] = useState(null);
  const resizeRef = useRef(null);

  const isResizing = resizeState !== null;

  function setResizeAndRef(value) {
    resizeRef.current = value;
    setResizeState(value);
  }

  // Compute the snapped duration (in whole hours) from a pointer Y position.
  // The duration is clamped to [1, END_HOUR - startHour].
  const getSnappedDuration = useCallback((clientY, startHour) => {
    const body = bodyRef.current;
    if (!body) return null;
    const rect = body.getBoundingClientRect();
    const y = clientY - rect.top + body.scrollTop;

    const eventTopY = (startHour - START_HOUR) * slotHeight;
    const heightPx = y - eventTopY;
    const rawDuration = Math.round(heightPx / slotHeight);
    const maxDuration = END_HOUR - startHour;
    return Math.max(1, Math.min(maxDuration, rawDuration));
  }, [slotHeight]);

  // Compute the snapped grid position (dayIndex, startHour) from a pointer location.
  const getSnappedPos = useCallback((clientX, clientY, grabOffsetHours) => {
    const body = bodyRef.current;
    if (!body) return null;
    const rect = body.getBoundingClientRect();
    const x = clientX - rect.left + body.scrollLeft;
    const y = clientY - rect.top + body.scrollTop;

    // Map x to day column
    const xInCols = x - TIME_GUTTER_WIDTH;
    const rawDay = Math.floor(xInCols / dayWidth);
    const dayIndex = Math.max(0, Math.min(DAYS.length - 1, rawDay));

    // Map y (adjusted for grab offset) to snapped hour
    const eventTopY = y - grabOffsetHours * slotHeight;
    const rawHour = Math.round(eventTopY / slotHeight) + START_HOUR;
    const startHour = Math.max(START_HOUR, Math.min(END_HOUR - 1, rawHour));

    return { dayIndex, startHour };
  }, [slotHeight, dayWidth]);

  // Add window-level pointer listeners while a drag is active.
  useEffect(() => {
    if (!isDragging) return;

    function onPointerMove(e) {
      const ds = dragRef.current;
      if (!ds) return;
      const pos = getSnappedPos(e.clientX, e.clientY, ds.grabOffsetHours);
      if (!pos) return;
      if (pos.dayIndex !== ds.previewDay || pos.startHour !== ds.previewHour) {
        const next = { ...ds, previewDay: pos.dayIndex, previewHour: pos.startHour };
        dragRef.current = next;
        setDragState(next);
      }
    }

    function onPointerUp(e) {
      const ds = dragRef.current;
      if (ds) {
        const pos = getSnappedPos(e.clientX, e.clientY, ds.grabOffsetHours);
        if (pos) {
          updateEvent(ds.eventId, { dayIndex: pos.dayIndex, startHour: pos.startHour });
          setEvents(getEvents());
        }
      }
      dragRef.current = null;
      setDragState(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isDragging, getSnappedPos]);

  // Add window-level pointer listeners while a resize is active.
  useEffect(() => {
    if (!isResizing) return;

    function onPointerMove(e) {
      const rs = resizeRef.current;
      if (!rs) return;
      const duration = getSnappedDuration(e.clientY, rs.startHour);
      if (duration !== null && duration !== rs.previewDuration) {
        const next = { ...rs, previewDuration: duration };
        resizeRef.current = next;
        setResizeState(next);
      }
    }

    function onPointerUp(e) {
      const rs = resizeRef.current;
      if (rs) {
        const duration = getSnappedDuration(e.clientY, rs.startHour);
        if (duration !== null) {
          updateEvent(rs.eventId, { durationHours: duration });
          setEvents(getEvents());
        }
      }
      resizeRef.current = null;
      setResizeState(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isResizing, getSnappedDuration]);

  // Attach non-passive touchmove listener for pinch-zoom on the planner root.
  // Two-finger pinch scales zoomX and zoomY independently based on the initial
  // zoom values captured at pinch start.
  const pinchRef = useRef(null);

  useEffect(() => {
    const el = plannerRef.current;
    if (!el) return;

    function getTouchDist(touches) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function onTouchStart(e) {
      if (e.touches.length === 2) {
        const dist = getTouchDist(e.touches);
        if (dist === 0) return;
        pinchRef.current = {
          initialDist: dist,
          initialZoom: { ...zoomRef.current },
        };
      }
    }

    function onTouchMove(e) {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      // Prevent the browser from scrolling or performing its own pinch-zoom.
      e.preventDefault();
      const dist = getTouchDist(e.touches);
      const ratio = dist / pinchRef.current.initialDist;
      setZoom({
        x: clampZoom(pinchRef.current.initialZoom.x * ratio),
        y: clampZoom(pinchRef.current.initialZoom.y * ratio),
      });
    }

    function onTouchEnd(e) {
      if (e.touches.length < 2) {
        pinchRef.current = null;
      }
    }

    el.addEventListener('touchstart', onTouchStart);
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []); // uses zoomXRef/zoomYRef so deps stay stable

  // Set a grabbing/resize cursor and disable text selection while interacting.
  useEffect(() => {
    if (isDragging || isResizing) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = isDragging ? 'grabbing' : 'ns-resize';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, isResizing]);

  const gridWidth = TIME_GUTTER_WIDTH + dayWidth * DAYS.length;

  // Compute overlap layout (columnIndex, columnCount) for each event per day.
  const overlapLayouts = useMemo(
    () => DAYS.map((_, dayIndex) => computeOverlapLayout(events.filter((e) => e.dayIndex === dayIndex))),
    [events],
  );

  const durationOptions = useMemo(() => {
    const selectedStartHour = Number(formState.startHour);
    const maxDuration = Math.max(1, END_HOUR - selectedStartHour);
    return Array.from({ length: maxDuration }, (_, i) => i + 1);
  }, [formState.startHour]);

  function resetForm() {
    setFormState({
      title: '',
      dayIndex: String(getDefaultDayIndex()),
      startHour: String(START_HOUR),
      durationHours: '1',
      color: EVENT_COLORS[0],
    });
  }

  function handleFormChange(field, value) {
    if (field === 'startHour') {
      const maxDuration = Math.max(1, END_HOUR - Number(value));
      setFormState((current) => ({
        ...current,
        startHour: value,
        durationHours: String(Math.min(Number(current.durationHours), maxDuration)),
      }));
      return;
    }

    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleCreateEvent(event) {
    event.preventDefault();
    const createdEvent = addEvent({
      title: formState.title,
      dayIndex: Number(formState.dayIndex),
      startHour: Number(formState.startHour),
      durationHours: Number(formState.durationHours),
      color: formState.color,
    });
    setEvents(getEvents());
    if (createdEvent) {
      setIsCreateOpen(false);
      resetForm();
    }
  }

  function handleEventPointerDown(e, calendarEvent) {
    // Ignore if the create-modal is open, a resize is in progress, or a pinch is active
    if (isCreateOpen || isResizing || pinchRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const body = bodyRef.current;
    if (!body) return;
    const rect = body.getBoundingClientRect();

    // Calculate how far down inside the event the user grabbed (in hours)
    const y = e.clientY - rect.top + body.scrollTop;
    const eventTopY = (calendarEvent.startHour - START_HOUR) * slotHeight;
    // Clamp grab offset to stay strictly inside the event bounds (subtract 1 px
    // so the offset never equals the full height, which would place the snap
    // point one slot below the event's actual end).
    const grabOffsetPx = Math.max(
      0,
      Math.min(y - eventTopY, calendarEvent.durationHours * slotHeight - 1),
    );

    setDragAndRef({
      eventId: calendarEvent.id,
      grabOffsetHours: grabOffsetPx / slotHeight,
      previewDay: calendarEvent.dayIndex,
      previewHour: calendarEvent.startHour,
      durationHours: calendarEvent.durationHours,
      color: calendarEvent.color,
    });
  }

  function handleResizePointerDown(e, calendarEvent) {
    // Ignore if the create-modal is open, a drag is in progress, or a pinch is active
    if (isCreateOpen || isDragging || pinchRef.current) return;
    e.preventDefault();
    e.stopPropagation(); // prevent the event's pointerdown (drag) from firing

    setResizeAndRef({
      eventId: calendarEvent.id,
      startHour: calendarEvent.startHour,
      dayIndex: calendarEvent.dayIndex,
      previewDuration: calendarEvent.durationHours,
      color: calendarEvent.color,
    });
  }

  return (
    <div ref={plannerRef} className="planner-root">
      <div className="planner-toolbar">
        <button
          type="button"
          className="add-event-button"
          onClick={() => {
            resetForm();
            setIsCreateOpen(true);
          }}
        >
          + Add event
        </button>
      </div>

      {/* Sticky header row: time gutter + day names */}
      <div className="planner-header" style={{ width: gridWidth }}>
        <div
          className="time-gutter-header"
          style={{ width: TIME_GUTTER_WIDTH, minWidth: TIME_GUTTER_WIDTH }}
        />
        {DAYS.map((day) => (
          <div
            key={day}
            className="day-header"
            style={{ width: dayWidth, minWidth: dayWidth }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Scrollable body */}
      <div ref={bodyRef} className="planner-body" style={{ width: gridWidth }}>
        {/* Time gutter column */}
        <div
          className="time-gutter"
          style={{ width: TIME_GUTTER_WIDTH, minWidth: TIME_GUTTER_WIDTH }}
        >
          {hours.map((hour) => (
            <div
              key={hour}
              className="time-label"
              style={{ height: slotHeight }}
            >
              {formatHour(hour)}
            </div>
          ))}
          {/* End label */}
          <div className="time-label time-label--end">{formatHour(END_HOUR)}</div>
        </div>

        {/* Day columns */}
        {DAYS.map((day, dayIndex) => (
          <div
            key={day}
            className={`day-column${dayIndex === DAYS.length - 1 ? ' day-column--last' : ''}`}
            style={{ width: dayWidth, minWidth: dayWidth }}
          >
            {hours.map((hour) => (
              <div
                key={hour}
                className="hour-slot"
                style={{ height: slotHeight }}
                aria-label={`${day} ${formatHour(hour)}`}
              />
            ))}

            {/* Drag ghost: shown in the target column at the snapped position */}
            {dragState && dragState.previewDay === dayIndex && (
              <div
                className="drag-ghost"
                style={{
                  top: (dragState.previewHour - START_HOUR) * slotHeight,
                  height: dragState.durationHours * slotHeight,
                  borderColor: dragState.color,
                }}
              />
            )}

            {/* Resize ghost: shown in the same column at the same startHour with preview duration */}
            {resizeState && resizeState.dayIndex === dayIndex && (
              <div
                className="drag-ghost"
                style={{
                  top: (resizeState.startHour - START_HOUR) * slotHeight,
                  height: resizeState.previewDuration * slotHeight,
                  borderColor: resizeState.color,
                }}
              />
            )}

            {events
              .filter((calendarEvent) => calendarEvent.dayIndex === dayIndex)
              .map((calendarEvent) => {
                const eventClasses = ['calendar-event'];
                if (dragState?.eventId === calendarEvent.id) eventClasses.push('calendar-event--dragging');
                if (resizeState?.eventId === calendarEvent.id) eventClasses.push('calendar-event--resizing');

                const layout = overlapLayouts[dayIndex];
                const { columnIndex, columnCount } = layout.get(calendarEvent.id) ?? { columnIndex: 0, columnCount: 1 };
                const leftPct = (columnIndex / columnCount) * 100;
                const widthPct = 100 / columnCount;

                return (
                <div
                  key={calendarEvent.id}
                  className={eventClasses.join(' ')}
                  style={{
                    // Event layout is derived from model values and snapped to hour-height units.
                    top: (calendarEvent.startHour - START_HOUR) * slotHeight,
                    height: calendarEvent.durationHours * slotHeight,
                    backgroundColor: calendarEvent.color,
                    left: `calc(${leftPct}% + ${INSET}px)`,
                    width: `calc(${widthPct}% - ${INSET * 2}px)`,
                  }}
                  title={calendarEvent.title || 'Untitled event'}
                  onPointerDown={(e) => handleEventPointerDown(e, calendarEvent)}
                >
                  {calendarEvent.title || 'Untitled event'}
                  <div
                    className="resize-handle"
                    onPointerDown={(e) => handleResizePointerDown(e, calendarEvent)}
                  />
                </div>
                );
              })}
          </div>
        ))}
      </div>

      {isCreateOpen && (
        <div className="create-event-modal" role="dialog" aria-modal="true">
          <form className="create-event-form" onSubmit={handleCreateEvent}>
            <h2>Create event</h2>

            <label>
              Title
              <input
                type="text"
                value={formState.title}
                onChange={(event) => handleFormChange('title', event.target.value)}
                placeholder="New event"
              />
            </label>

            <label>
              Day
              <select
                value={formState.dayIndex}
                onChange={(event) => handleFormChange('dayIndex', event.target.value)}
              >
                {DAYS.map((day, dayIndex) => (
                  <option key={day} value={dayIndex}>
                    {day}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Start hour
              <select
                value={formState.startHour}
                onChange={(event) => handleFormChange('startHour', event.target.value)}
              >
                {hours.map((hour) => (
                  <option key={hour} value={hour}>
                    {formatHour(hour)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Duration (hours)
              <select
                value={formState.durationHours}
                onChange={(event) => handleFormChange('durationHours', event.target.value)}
              >
                {durationOptions.map((duration) => (
                  <option key={duration} value={duration}>
                    {duration}
                  </option>
                ))}
              </select>
            </label>

            <fieldset>
              <legend>Color</legend>
              <div className="event-color-palette">
                {EVENT_COLORS.map((color) => (
                  <label key={color} className="event-color-option">
                    <input
                      type="radio"
                      name="event-color"
                      value={color}
                      checked={formState.color === color}
                      onChange={(event) => handleFormChange('color', event.target.value)}
                    />
                    <span className="event-color-swatch" style={{ backgroundColor: color }} />
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="create-event-actions">
              <button type="button" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </button>
              <button type="submit">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
