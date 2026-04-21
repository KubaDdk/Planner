/**
 * Compute side-by-side layout columns for overlapping events within a single day.
 *
 * Algorithm:
 *  1. Sort events by start hour (ascending), then by end hour descending (longer first).
 *  2. Greedily assign each event to the lowest-indexed column whose last occupant ends
 *     at or before the event's start. Open a new column when none is free.
 *  3. Detect contiguous clusters (maximal sets of transitively overlapping intervals)
 *     by sweeping through the sorted list and tracking the running max end hour.
 *  4. For each cluster, columnCount = max assigned column index + 1.
 *
 * Returns a Map<eventId, { columnIndex: number, columnCount: number }>.
 * Events that do not overlap any other event get columnCount = 1.
 *
 * @param {Array<{ id: string, startHour: number, durationHours: number }>} events
 * @returns {Map<string, { columnIndex: number, columnCount: number }>}
 */
export function computeOverlapLayout(events) {
  if (events.length === 0) return new Map();

  // Sort by start hour; break ties by putting longer events first for better packing.
  const sorted = [...events].sort((a, b) => {
    if (a.startHour !== b.startHour) return a.startHour - b.startHour;
    return (b.startHour + b.durationHours) - (a.startHour + a.durationHours);
  });

  // Greedy column assignment.
  // columns[i] = endHour of the most recently placed event in column i.
  const columns = [];
  const assignments = new Map(); // eventId -> columnIndex

  for (const event of sorted) {
    const endHour = event.startHour + event.durationHours;
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      if (columns[col] <= event.startHour) {
        assignments.set(event.id, col);
        columns[col] = endHour;
        placed = true;
        break;
      }
    }
    if (!placed) {
      assignments.set(event.id, columns.length);
      columns.push(endHour);
    }
  }

  // Cluster detection: maximal groups of transitively overlapping events.
  // Because the list is sorted by start, a new cluster begins whenever the
  // next event's start hour >= the running maximum end hour of the current cluster.
  const result = new Map();
  let clusterStart = 0;
  let clusterMaxEnd = sorted[0].startHour + sorted[0].durationHours;

  for (let i = 1; i <= sorted.length; i++) {
    const done = i === sorted.length;
    const startsNewCluster = !done && sorted[i].startHour >= clusterMaxEnd;

    if (done || startsNewCluster) {
      // Finalize cluster [clusterStart, i).
      let maxCol = 0;
      for (let j = clusterStart; j < i; j++) {
        const col = assignments.get(sorted[j].id);
        if (col > maxCol) maxCol = col;
      }
      const columnCount = maxCol + 1;
      for (let j = clusterStart; j < i; j++) {
        result.set(sorted[j].id, {
          columnIndex: assignments.get(sorted[j].id),
          columnCount,
        });
      }
      clusterStart = i;
      if (!done) clusterMaxEnd = sorted[i].startHour + sorted[i].durationHours;
    } else {
      const end = sorted[i].startHour + sorted[i].durationHours;
      if (end > clusterMaxEnd) clusterMaxEnd = end;
    }
  }

  return result;
}
