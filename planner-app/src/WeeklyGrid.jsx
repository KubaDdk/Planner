import {
  DAYS,
  START_HOUR,
  END_HOUR,
  HOUR_COUNT,
  BASE_SLOT_HEIGHT,
  BASE_DAY_WIDTH,
  TIME_GUTTER_WIDTH,
} from './constants';
import './WeeklyGrid.css';

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

export default function WeeklyGrid() {
  const hours = Array.from({ length: HOUR_COUNT }, (_, i) => START_HOUR + i);

  const gridWidth = TIME_GUTTER_WIDTH + BASE_DAY_WIDTH * DAYS.length;

  return (
    <div className="planner-root">
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
          </div>
        ))}
      </div>
    </div>
  );
}
