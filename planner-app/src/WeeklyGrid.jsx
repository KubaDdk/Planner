import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import './WeeklyGrid.css';

const EVENT_COLORS = ['#2563eb', '#9333ea', '#db2777', '#ea580c', '#059669'];

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function getDefaultDayIndex() {
  const today = (new Date().getDay() + 6) % 7;
  return Math.min(Math.max(today, 0), DAYS.length - 1);
}

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

  // Drag state for rendering (ghost + opacity). The ref holds the same value
  // so window listeners can always access the latest without stale closures.
  const [dragState, setDragState] = useState(null);
  const dragRef = useRef(null);
  const bodyRef = useRef(null);

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

    const eventTopY = (startHour - START_HOUR) * BASE_SLOT_HEIGHT;
    const heightPx = y - eventTopY;
    const rawDuration = Math.round(heightPx / BASE_SLOT_HEIGHT);
    const maxDuration = END_HOUR - startHour;
    return Math.max(1, Math.min(maxDuration, rawDuration));
  }, []);

  // Compute the snapped grid position (dayIndex, startHour) from a pointer location.
  const getSnappedPos = useCallback((clientX, clientY, grabOffsetHours) => {
    const body = bodyRef.current;
    if (!body) return null;
    const rect = body.getBoundingClientRect();
    const x = clientX - rect.left + body.scrollLeft;
    const y = clientY - rect.top + body.scrollTop;

    // Map x to day column
    const xInCols = x - TIME_GUTTER_WIDTH;
    const rawDay = Math.floor(xInCols / BASE_DAY_WIDTH);
    const dayIndex = Math.max(0, Math.min(DAYS.length - 1, rawDay));

    // Map y (adjusted for grab offset) to snapped hour
    const eventTopY = y - grabOffsetHours * BASE_SLOT_HEIGHT;
    const rawHour = Math.round(eventTopY / BASE_SLOT_HEIGHT) + START_HOUR;
    const startHour = Math.max(START_HOUR, Math.min(END_HOUR - 1, rawHour));

    return { dayIndex, startHour };
  }, []);

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

  const gridWidth = TIME_GUTTER_WIDTH + BASE_DAY_WIDTH * DAYS.length;
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
    // Ignore if the create-modal is open or a resize is in progress
    if (isCreateOpen || isResizing) return;
    e.preventDefault();
    e.stopPropagation();

    const body = bodyRef.current;
    if (!body) return;
    const rect = body.getBoundingClientRect();

    // Calculate how far down inside the event the user grabbed (in hours)
    const y = e.clientY - rect.top + body.scrollTop;
    const eventTopY = (calendarEvent.startHour - START_HOUR) * BASE_SLOT_HEIGHT;
    // Clamp grab offset to stay strictly inside the event bounds (subtract 1 px
    // so the offset never equals the full height, which would place the snap
    // point one slot below the event's actual end).
    const grabOffsetPx = Math.max(
      0,
      Math.min(y - eventTopY, calendarEvent.durationHours * BASE_SLOT_HEIGHT - 1),
    );

    setDragAndRef({
      eventId: calendarEvent.id,
      grabOffsetHours: grabOffsetPx / BASE_SLOT_HEIGHT,
      previewDay: calendarEvent.dayIndex,
      previewHour: calendarEvent.startHour,
      durationHours: calendarEvent.durationHours,
      color: calendarEvent.color,
    });
  }

  function handleResizePointerDown(e, calendarEvent) {
    // Ignore if the create-modal is open or a drag is in progress
    if (isCreateOpen || isDragging) return;
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
    <div className="planner-root">
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
            style={{ width: BASE_DAY_WIDTH, minWidth: BASE_DAY_WIDTH }}
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
              style={{ height: BASE_SLOT_HEIGHT }}
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
            style={{ width: BASE_DAY_WIDTH, minWidth: BASE_DAY_WIDTH }}
          >
            {hours.map((hour) => (
              <div
                key={hour}
                className="hour-slot"
                style={{ height: BASE_SLOT_HEIGHT }}
                aria-label={`${day} ${formatHour(hour)}`}
              />
            ))}

            {/* Drag ghost: shown in the target column at the snapped position */}
            {dragState && dragState.previewDay === dayIndex && (
              <div
                className="drag-ghost"
                style={{
                  top: (dragState.previewHour - START_HOUR) * BASE_SLOT_HEIGHT,
                  height: dragState.durationHours * BASE_SLOT_HEIGHT,
                  borderColor: dragState.color,
                }}
              />
            )}

            {/* Resize ghost: shown in the same column at the same startHour with preview duration */}
            {resizeState && resizeState.dayIndex === dayIndex && (
              <div
                className="drag-ghost"
                style={{
                  top: (resizeState.startHour - START_HOUR) * BASE_SLOT_HEIGHT,
                  height: resizeState.previewDuration * BASE_SLOT_HEIGHT,
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
                return (
                <div
                  key={calendarEvent.id}
                  className={eventClasses.join(' ')}
                  style={{
                    // Event layout is derived from model values and snapped to hour-height units.
                    top: (calendarEvent.startHour - START_HOUR) * BASE_SLOT_HEIGHT,
                    height: calendarEvent.durationHours * BASE_SLOT_HEIGHT,
                    backgroundColor: calendarEvent.color,
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
