import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGesture } from '@use-gesture/react';
import {
  DAYS,
  CALENDAR_DAY_COUNT,
  START_HOUR,
  END_HOUR,
  HOUR_COUNT,
  BASE_SLOT_HEIGHT,
} from './constants';
import { addEvent, getEvents, updateEvent } from './eventStore';
import { computeOverlapLayout } from './overlapLayout';
import './WeeklyGrid.css';

const ZOOM_Y_MIN = 0.5;
const ZOOM_Y_MAX = 4;

const EVENT_COLORS = ['#2563eb', '#9333ea', '#db2777', '#ea580c', '#059669'];

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatTimeLabel(startHour, durationHours) {
  return `${formatHour(startHour)} · ${durationHours}h`;
}

function getDefaultDayIndex() {
  const today = (new Date().getDay() + 6) % 7;
  return Math.min(Math.max(today, 0), CALENDAR_DAY_COUNT - 1);
}

const INSET = 4; // px gap on each outer edge of an overlap column

export default function WeeklyGrid() {
  const hours = Array.from({ length: HOUR_COUNT }, (_, i) => START_HOUR + i);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [events, setEvents] = useState(() => getEvents());

  // Theme: 'dark' | 'light', persisted to localStorage
  const [theme, setTheme] = useState(() => localStorage.getItem('planner-theme') || 'dark');

  function toggleTheme() {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('planner-theme', next);
      return next;
    });
  }

  // Vertical zoom scale; pinch gesture adjusts slot heights.
  const [zoomY, setZoomY] = useState(1);
  // Ref so gesture callbacks always read the latest value without stale closures.
  const zoomYRef = useRef(1);

  const slotHeight = BASE_SLOT_HEIGHT * zoomY;

  // Keep ref in sync with state so all callbacks always read the current zoom.
  useEffect(() => { zoomYRef.current = zoomY; }, [zoomY]);

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

  const isDragging = dragState !== null;

  function setDragAndRef(value) {
    dragRef.current = value;
    setDragState(value);
  }

  // Per-card body element refs (indexed 0–CALENDAR_DAY_COUNT-1; To Do card has no time-based ref).
  const dayCardBodyRefs = useRef(Array.from({ length: CALENDAR_DAY_COUNT }, () => null));

  // Inline-editing state: tracks which event title is being edited.
  const [editingEventId, setEditingEventId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef(null);
  // Tracks the original title so we can revert if the user clears the field or cancels.
  const editOriginalTitleRef = useRef('');
  // Flag set during Escape/cancel to suppress the subsequent blur commit.
  const editCancellingRef = useRef(false);

  // Focus the input whenever editing begins.
  useEffect(() => {
    if (editingEventId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingEventId]);

  function handleEditStart(e, calendarEvent) {
    e.stopPropagation();
    e.preventDefault();
    editOriginalTitleRef.current = calendarEvent.title;
    editCancellingRef.current = false;
    setEditingEventId(calendarEvent.id);
    setEditingTitle(calendarEvent.title);
  }

  function handleEditCommit(id, title) {
    if (editCancellingRef.current) return;
    if (id) {
      const trimmed = title.trim();
      // Revert to original if the user cleared the title; otherwise save.
      const finalTitle = trimmed || editOriginalTitleRef.current;
      updateEvent(id, { title: finalTitle });
      setEvents(getEvents());
    }
    setEditingEventId(null);
    setEditingTitle('');
  }

  function handleEditBlur() {
    handleEditCommit(editingEventId, editingTitle);
  }

  function handleEditKeyDown(e) {
    if (e.key === 'Enter') {
      // Blur the input which will trigger handleEditBlur → handleEditCommit.
      editInputRef.current?.blur();
    } else if (e.key === 'Escape') {
      // Set the cancelling flag before blurring so handleEditBlur is a no-op.
      editCancellingRef.current = true;
      setEditingEventId(null);
      setEditingTitle('');
      // Reset the flag after the blur event fires.
      requestAnimationFrame(() => { editCancellingRef.current = false; });
    }
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
  const getSnappedDuration = useCallback((clientY, startHour, dayIndex) => {
    const cardBody = dayCardBodyRefs.current[dayIndex];
    if (!cardBody) return null;
    const rect = cardBody.getBoundingClientRect();
    const y = clientY - rect.top + cardBody.scrollTop;

    const currentSlotHeight = BASE_SLOT_HEIGHT * zoomYRef.current;
    const eventTopY = (startHour - START_HOUR) * currentSlotHeight;
    const heightPx = y - eventTopY;
    const rawDuration = Math.round(heightPx / currentSlotHeight);
    const maxDuration = END_HOUR - startHour;
    return Math.max(1, Math.min(maxDuration, rawDuration));
  }, []);

  // Compute the snapped grid position (dayIndex, startHour) from a pointer location.
  // Iterates over each calendar-day card body to find which column the pointer is in.
  // When multiple columns share the same X range (e.g. Mon and Fri in a 4-column grid),
  // an exact XY hit takes priority; otherwise the column closest by Y distance is used.
  const getSnappedPos = useCallback((clientX, clientY, grabOffsetHours) => {
    let foundDay = -1;
    let closestDay = -1;
    let closestYDist = Infinity;
    for (let i = 0; i < CALENDAR_DAY_COUNT; i++) {
      const cardBody = dayCardBodyRefs.current[i];
      if (!cardBody) continue;
      const rect = cardBody.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) {
        if (clientY >= rect.top && clientY <= rect.bottom) {
          foundDay = i;
          break;
        }
        const yDist = Math.min(Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom));
        if (yDist < closestYDist) {
          closestYDist = yDist;
          closestDay = i;
        }
      }
    }
    if (foundDay === -1) foundDay = closestDay;
    if (foundDay === -1) return null;

    const cardBody = dayCardBodyRefs.current[foundDay];
    const rect = cardBody.getBoundingClientRect();
    const y = clientY - rect.top + cardBody.scrollTop;

    const currentSlotHeight = BASE_SLOT_HEIGHT * zoomYRef.current;

    // Map y (adjusted for grab offset) to snapped hour
    const eventTopY = y - grabOffsetHours * currentSlotHeight;
    const rawHour = Math.round(eventTopY / currentSlotHeight) + START_HOUR;
    const startHour = Math.max(START_HOUR, Math.min(END_HOUR - 1, rawHour));

    return { dayIndex: foundDay, startHour };
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

    // Cancel drag without committing if the pointer is stolen (e.g. browser gesture takeover).
    function onPointerCancel() {
      dragRef.current = null;
      setDragState(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [isDragging, getSnappedPos]);

  // Add window-level pointer listeners while a resize is active.
  useEffect(() => {
    if (!isResizing) return;

    function onPointerMove(e) {
      const rs = resizeRef.current;
      if (!rs) return;
      const duration = getSnappedDuration(e.clientY, rs.startHour, rs.dayIndex);
      if (duration !== null && duration !== rs.previewDuration) {
        const next = { ...rs, previewDuration: duration };
        resizeRef.current = next;
        setResizeState(next);
      }
    }

    function onPointerUp(e) {
      const rs = resizeRef.current;
      if (rs) {
        const duration = getSnappedDuration(e.clientY, rs.startHour, rs.dayIndex);
        if (duration !== null) {
          updateEvent(rs.eventId, { durationHours: duration });
          setEvents(getEvents());
        }
      }
      resizeRef.current = null;
      setResizeState(null);
    }

    // Cancel resize without committing if the pointer is stolen.
    function onPointerCancel() {
      resizeRef.current = null;
      setResizeState(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [isResizing, getSnappedDuration]);

  // Cancel active drag or resize on Escape without committing the change.
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (isDragging) {
        dragRef.current = null;
        setDragState(null);
      }
      if (isResizing) {
        resizeRef.current = null;
        setResizeState(null);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDragging, isResizing]);

  // Close the create-event modal on Escape.
  useEffect(() => {
    if (!isCreateOpen) return;

    function onKeyDown(e) {
      if (e.key === 'Escape') setIsCreateOpen(false);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isCreateOpen]);

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

  // Attach pinch gesture to the planner grid for two-finger zoom (Y axis only).
  const gridRef = useRef(null);
  const pinchOriginRef = useRef({ zoomY: 1 });
  const bindGesture = useGesture(
    {
      onPinchStart() {
        pinchOriginRef.current = { zoomY: zoomYRef.current };
      },
      onPinch({ offset: [scale] }) {
        // offset[0] is the cumulative scale factor since the gesture began (starts at 1).
        const origin = pinchOriginRef.current;
        const newY = Math.max(ZOOM_Y_MIN, Math.min(ZOOM_Y_MAX, origin.zoomY * scale));
        zoomYRef.current = newY;
        setZoomY(newY);
      },
    },
    { pinch: { scaleBounds: { min: ZOOM_Y_MIN, max: ZOOM_Y_MAX }, rubberband: false } },
  );

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
    // Ignore if the create-modal is open, a resize is in progress, or this event is being edited
    if (isCreateOpen || isResizing || editingEventId === calendarEvent.id) return;
    e.preventDefault();
    e.stopPropagation();

    const cardBody = dayCardBodyRefs.current[calendarEvent.dayIndex];
    if (!cardBody) return;
    const rect = cardBody.getBoundingClientRect();

    // Calculate how far down inside the event the user grabbed (in hours)
    const y = e.clientY - rect.top + cardBody.scrollTop;
    const currentSlotHeight = BASE_SLOT_HEIGHT * zoomYRef.current;
    const eventTopY = (calendarEvent.startHour - START_HOUR) * currentSlotHeight;
    // Clamp grab offset to stay strictly inside the event bounds (subtract 1 px
    // so the offset never equals the full height, which would place the snap
    // point one slot below the event's actual end).
    const grabOffsetPx = Math.max(
      0,
      Math.min(y - eventTopY, calendarEvent.durationHours * currentSlotHeight - 1),
    );

    setDragAndRef({
      eventId: calendarEvent.id,
      grabOffsetHours: grabOffsetPx / currentSlotHeight,
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
    <div className={`planner-root theme-${theme}`}>
      <div className="planner-toolbar">
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          <div className="theme-toggle-track">
            <div className="theme-toggle-thumb">
              {theme === 'dark' ? '🌙' : '☀️'}
            </div>
          </div>
          <span className="theme-toggle-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
        </button>
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

      {/* CSS Grid: 4-column card layout (Mon–Thu / Fri–Sun + To Do) */}
      <div ref={gridRef} className="planner-grid" {...bindGesture()}>
        {DAYS.map((day, dayIndex) => {
          const isToDo = dayIndex === CALENDAR_DAY_COUNT; // last entry is To Do

          return (
            <div key={day} className="day-card-wrapper">
              <div className="day-card-label">{day}</div>
              <div className="day-card">
                {isToDo ? (
                  /* To Do card: flat list of events (no time positioning) */
                  <div className="day-card-body day-card-body--todo">
                    {events
                      .filter((ev) => ev.dayIndex === dayIndex)
                      .map((ev) => (
                        <div
                          key={ev.id}
                          className="todo-event-item"
                          style={{ backgroundColor: ev.color }}
                          title={ev.title || 'Untitled'}
                        >
                          {ev.title || 'Untitled'}
                        </div>
                      ))}
                  </div>
                ) : (
                  /* Calendar day card: time-slot-based, scrollable */
                  <div
                    className="day-card-body"
                    ref={(el) => { dayCardBodyRefs.current[dayIndex] = el; }}
                    style={{ height: HOUR_COUNT * slotHeight }}
                  >
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="hour-slot"
                        style={{ height: slotHeight }}
                        aria-label={`${day} ${formatHour(hour)}`}
                        onClick={() => {
                          if (isDragging || isResizing || isCreateOpen) return;
                          setFormState({
                            title: '',
                            dayIndex: String(dayIndex),
                            startHour: String(hour),
                            durationHours: '1',
                            color: EVENT_COLORS[0],
                          });
                          setIsCreateOpen(true);
                        }}
                      >
                        <span className="hour-slot-label">{formatHour(hour)}</span>
                      </div>
                    ))}

                    {/* Drag ghost */}
                    {dragState && dragState.previewDay === dayIndex && (
                      <div
                        className="drag-ghost"
                        style={{
                          top: (dragState.previewHour - START_HOUR) * slotHeight,
                          height: dragState.durationHours * slotHeight,
                          borderColor: dragState.color,
                        }}
                      >
                        <span className="drag-ghost-time" style={{ color: dragState.color }}>
                          {formatTimeLabel(dragState.previewHour, dragState.durationHours)}
                        </span>
                      </div>
                    )}

                    {/* Resize ghost */}
                    {resizeState && resizeState.dayIndex === dayIndex && (
                      <div
                        className="drag-ghost"
                        style={{
                          top: (resizeState.startHour - START_HOUR) * slotHeight,
                          height: resizeState.previewDuration * slotHeight,
                          borderColor: resizeState.color,
                        }}
                      >
                        <span className="drag-ghost-time" style={{ color: resizeState.color }}>
                          {formatTimeLabel(resizeState.startHour, resizeState.previewDuration)}
                        </span>
                      </div>
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
                              top: (calendarEvent.startHour - START_HOUR) * slotHeight,
                              height: calendarEvent.durationHours * slotHeight,
                              backgroundColor: calendarEvent.color,
                              left: `calc(${leftPct}% + ${INSET}px)`,
                              width: `calc(${widthPct}% - ${INSET * 2}px)`,
                            }}
                            title={calendarEvent.title || 'Untitled event'}
                            onPointerDown={(e) => handleEventPointerDown(e, calendarEvent)}
                          >
                            {editingEventId === calendarEvent.id ? (
                              <input
                                ref={editInputRef}
                                className="calendar-event-title-input"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onBlur={handleEditBlur}
                                onKeyDown={handleEditKeyDown}
                                onPointerDown={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span
                                className="calendar-event-title"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => handleEditStart(e, calendarEvent)}
                              >
                                {calendarEvent.title || 'Untitled event'}
                              </span>
                            )}
                            <span className="calendar-event-time">
                              {formatTimeLabel(calendarEvent.startHour, calendarEvent.durationHours)}
                            </span>
                            <div
                              className="resize-handle"
                              onPointerDown={(e) => handleResizePointerDown(e, calendarEvent)}
                            />
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isCreateOpen && (
        <div
          className="create-event-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Create event"
          onClick={() => setIsCreateOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsCreateOpen(false); }}
        >
          <form className="create-event-form" onSubmit={handleCreateEvent} onClick={(e) => e.stopPropagation()}>
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
                disabled={Number(formState.dayIndex) === CALENDAR_DAY_COUNT}
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
                disabled={Number(formState.dayIndex) === CALENDAR_DAY_COUNT}
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
