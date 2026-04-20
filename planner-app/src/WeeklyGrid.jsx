import { useMemo, useState } from 'react';
import {
  DAYS,
  START_HOUR,
  END_HOUR,
  HOUR_COUNT,
  BASE_SLOT_HEIGHT,
  BASE_DAY_WIDTH,
  TIME_GUTTER_WIDTH,
} from './constants';
import { addEvent, getEvents } from './eventStore';
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
      <div className="planner-body" style={{ width: gridWidth }}>
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

            {events
              .filter((calendarEvent) => calendarEvent.dayIndex === dayIndex)
              .map((calendarEvent) => (
                <div
                  key={calendarEvent.id}
                  className="calendar-event"
                  style={{
                    // Event layout is derived from model values and snapped to hour-height units.
                    top: (calendarEvent.startHour - START_HOUR) * BASE_SLOT_HEIGHT,
                    height: calendarEvent.durationHours * BASE_SLOT_HEIGHT,
                    backgroundColor: calendarEvent.color,
                  }}
                  title={calendarEvent.title || 'Untitled event'}
                >
                  {calendarEvent.title || 'Untitled event'}
                </div>
              ))}
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
