/**
 * timeSlotGenerator.js - Dynamic time slot generator with dual-duration support
 * Generates 60min (1hr) and 90min (1.5hr) slots with 15min gaps between classes
 */

/**
 * Generate time slots based on configuration
 * @param {Object} config - Time slot configuration
 * @param {string} config.startTime - Start time in HH:MM format (e.g., "09:00")
 * @param {string} config.endTime - End time in HH:MM format (e.g., "18:00")
 * @param {number} config.gapDuration - Gap between classes in minutes (default: 15)
 * @param {number} config.breakAfterPeriod - Insert lunch after this many periods (default: 4)
 * @param {number} config.lunchDuration - Lunch break duration in minutes (default: 60)
 * @returns {Object} { days: string[], slots: Array, breakSlots: Array }
 */
function generateTimeSlots(config) {
  const {
    startTime = "09:00",
    endTime = "18:00",
    gapDuration = 15,
    breakAfterPeriod = 4,
    lunchDuration = 60
  } = config;

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const slots = [];
  const breakSlots = [];

  // Parse start time
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  let currentMinutes = startMinutes;
  let slotId = 1;
  let periodsSinceLunch = 0;

  while (currentMinutes < endMinutes) {
    // Check if we need to insert lunch break
    if (periodsSinceLunch >= breakAfterPeriod) {
      // Insert lunch break
      const lunchEndMinutes = currentMinutes + lunchDuration;

      // Only add lunch if it fits before end time
      if (lunchEndMinutes <= endMinutes) {
        breakSlots.push(slotId);
        slots.push({
          id: slotId,
          label: "Lunch Break",
          start: formatTime(currentMinutes),
          end: formatTime(lunchEndMinutes),
          duration: lunchDuration,
          is_break: true
        });
        slotId++;
        currentMinutes = lunchEndMinutes;
        periodsSinceLunch = 0;
        continue;
      }
    }

    // Generate both 60min and 90min slots from the same timeline
    // Each slot type gets its own entry but they share the timeline

    // 60-minute slot (1hr)
    const period60EndMinutes = currentMinutes + 60;
    if (period60EndMinutes <= endMinutes) {
      slots.push({
        id: slotId,
        label: `${formatTime(currentMinutes)}-${formatTime(period60EndMinutes)}`,
        start: formatTime(currentMinutes),
        end: formatTime(period60EndMinutes),
        duration: 60,
        is_break: false
      });
      slotId++;
    }

    // 90-minute slot (1.5hr) - starts at same time, extends further
    const period90EndMinutes = currentMinutes + 90;
    if (period90EndMinutes <= endMinutes) {
      slots.push({
        id: slotId,
        label: `${formatTime(currentMinutes)}-${formatTime(period90EndMinutes)}`,
        start: formatTime(currentMinutes),
        end: formatTime(period90EndMinutes),
        duration: 90,
        is_break: false
      });
      slotId++;
    }

    // Move current time forward by the longer period + gap
    // The 90min slot determines when the next block can start
    currentMinutes = period90EndMinutes + gapDuration;
    periodsSinceLunch++;
  }

  return { days, slots, breakSlots };
}

/**
 * Get slots that overlap with a given time range
 * @param {Array} slots - All slot objects
 * @param {string} day - Day name
 * @param {number} slotId - The slot ID to check overlaps for
 * @returns {Array<number>} Array of slot IDs that overlap with the given slot
 */
function getSlotsInTimeRange(slots, day, slotId) {
  const targetSlot = slots.find(s => s.id === slotId);
  if (!targetSlot) return [];

  const targetStart = timeToMinutes(targetSlot.start);
  const targetEnd = timeToMinutes(targetSlot.end);

  const overlappingSlots = slots.filter(s => {
    if (s.id === slotId) return true; // Include self
    const slotStart = timeToMinutes(s.start);
    const slotEnd = timeToMinutes(s.end);
    // Check for any overlap
    return slotStart < targetEnd && slotEnd > targetStart;
  });

  return overlappingSlots.map(s => s.id);
}

/**
 * Convert time string to minutes since midnight
 * @param {string} time - Time in H:MM or HH:MM format
 * @returns {number} Minutes since midnight
 */
function timeToMinutes(time) {
  const [hour, min] = time.split(':').map(Number);
  return hour * 60 + min;
}

/**
 * Format minutes since midnight to HH:MM string
 * @param {number} totalMinutes - Minutes since midnight
 * @returns {string} Time in H:MM format (e.g., "9:00", "1:00")
 */
function formatTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // Use 12-hour format without leading zero for hours
  const displayHours = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
  const displayMinutes = minutes.toString().padStart(2, '0');

  return `${displayHours}:${displayMinutes}`;
}

module.exports = {
  generateTimeSlots,
  formatTime,
  timeToMinutes,
  getSlotsInTimeRange
};

// Test code - runs only when executed directly
if (require.main === module) {
  console.log('=== Time Slot Generator Tests (Dual Duration) ===\n');

  // Test 1: Default configuration with dual-duration slots
  console.log('Test 1: Default configuration (60/90 min slots, 15min gaps)');
  const config1 = {
    startTime: "09:00",
    endTime: "18:00",
    gapDuration: 15,
    breakAfterPeriod: 4,
    lunchDuration: 60
  };
  const result1 = generateTimeSlots(config1);
  console.log(`Days: ${result1.days.join(', ')}`);
  console.log(`Total slots: ${result1.slots.length}`);
  console.log(`Break slots: ${result1.breakSlots.join(', ')}`);
  console.log('Slots:');
  result1.slots.forEach(s => {
    console.log(`  ${s.id}: ${s.label} (${s.duration}min)${s.is_break ? ' (BREAK)' : ''}`);
  });

  // Test 2: getSlotsInTimeRange
  console.log('\nTest 2: getSlotsInTimeRange - overlap detection');
  const slot90 = result1.slots.find(s => s.duration === 90);
  if (slot90) {
    const overlapping = getSlotsInTimeRange(result1.slots, 'Monday', slot90.id);
    console.log(`  90min slot ${slot90.id} (${slot90.label}) overlaps with: ${overlapping.join(', ')}`);
  }

  // Test 3: Early dismissal
  console.log('\nTest 3: Early dismissal (9:00-14:00)');
  const config3 = {
    startTime: "09:00",
    endTime: "14:00",
    gapDuration: 15,
    breakAfterPeriod: 3,
    lunchDuration: 45
  };
  const result3 = generateTimeSlots(config3);
  console.log(`Total slots: ${result3.slots.length}`);
  console.log('Slots:');
  result3.slots.forEach(s => {
    console.log(`  ${s.id}: ${s.label} (${s.duration}min)${s.is_break ? ' (BREAK)' : ''}`);
  });

  console.log('\n=== All tests complete! ===');
}
