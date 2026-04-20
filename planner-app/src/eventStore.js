import { DAYS, START_HOUR, END_HOUR } from './constants';

const events = [];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeEvent(input) {
  const startHour = clamp(Number(input.startHour), START_HOUR, END_HOUR - 1);
  const maxDuration = Math.max(1, END_HOUR - startHour);
  const durationHours = clamp(Number(input.durationHours), 1, maxDuration);

  return {
    id: createEventId(),
    title: String(input.title ?? '').trim(),
    dayIndex: clamp(Number(input.dayIndex), 0, DAYS.length - 1),
    startHour,
    durationHours,
    color: String(input.color || '#2563eb'),
  };
}

export function addEvent(event) {
  const normalizedEvent = normalizeEvent(event);
  events.push(normalizedEvent);
  return normalizedEvent;
}

export function getEvents() {
  return [...events];
}

export function removeEvent(id) {
  const eventIndex = events.findIndex((event) => event.id === id);
  if (eventIndex === -1) {
    return false;
  }
  events.splice(eventIndex, 1);
  return true;
}
