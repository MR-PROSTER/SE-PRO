/**
 * timeSlotGenerator.js - Dynamic time slot generator
 * Generates single-duration slots with 15min gaps and lunch break
 */

/**
 * Generate time slots based on configuration
 * @param {Object} config - Time slot configuration
 * @param {string} config.startTime - Start time in HH:MM format (e.g., "09:00")
 * @param {string} config.endTime - End time in HH:MM format (e.g., "18:00")
 * @param {number} config.periodDuration - Class period duration in minutes (default: 60)
 * @param {number} config.lunchAfterPeriod - Insert lunch after this many periods (default: 4)
 * @param {number} config.lunchDuration - Lunch break duration in minutes (default: 60)
 * @param {number} config.gapDuration - Gap between classes in minutes (default: 15)
 * @returns {Object} { days: string[], slots: Array, breakSlots: Array }
 */
function generateTimeSlots(config) {
  const {
    startTime = "09:00",
    endTime = "18:00",
    periodDuration = 60,
    lunchAfterPeriod = 4,
    lunchDuration = 60,
    gapDuration = 15
  } = config;

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const slots = [];

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  let currentMinutes = startMinutes;
  let slotId = 1;
  let periodCount = 0;
  let lunchInserted = false;

  while (true) {
    // Insert lunch AFTER lunchAfterPeriod periods
    if (!lunchInserted && periodCount === lunchAfterPeriod) {
      const lunchStart = minutesToTime(currentMinutes);
      const lunchEndMinutes = currentMinutes + lunchDuration;
      const lunchEnd = minutesToTime(lunchEndMinutes);

      slots.push({
        id: slotId,
        label: `Lunch Break (${lunchStart}–${lunchEnd})`,
        start: lunchStart,
        end: lunchEnd,
        duration: lunchDuration,
        is_break: true
      });
      slotId++;
      lunchInserted = true;
      currentMinutes = lunchEndMinutes + gapDuration; // gap after lunch
      continue;
    }

    // Check if another class fits before endTime
    const classEndMinutes = currentMinutes + periodDuration;
    if (classEndMinutes > endMinutes) break;

    const start = minutesToTime(currentMinutes);
    const end = minutesToTime(classEndMinutes);

    slots.push({
      id: slotId,
      label: `${start}–${end}`,
      start,
      end,
      duration: periodDuration,
      is_break: false
    });
    slotId++;
    periodCount++;

    // Add gap after class, but NOT if next will be lunch (lunch starts right after last period)
    if (periodCount === lunchAfterPeriod) {
      currentMinutes = classEndMinutes; // No gap before lunch
    } else {
      currentMinutes = classEndMinutes + gapDuration; // 15-min gap between classes
    }
  }

  const breakSlots = slots.filter(s => s.is_break).map(s => s.id);

  return { days, slots, breakSlots };
}

/**
 * Get slots that overlap with a given time range
 * @param {Array} slots - All slot objects
 * @param {string} day - Day name (ignored, same slots every day)
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
function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

module.exports = {
  generateTimeSlots,
  timeToMinutes,
  minutesToTime,
  getSlotsInTimeRange
};

// Test code - runs only when executed directly
if (require.main === module) {
  console.log('=== Time Slot Generator Tests ===\n');

  // Test 1: Default configuration
  console.log('Test 1: Default configuration (60min slots, 15min gaps, lunch after 4)');
  const config1 = {
    startTime: "09:00",
    endTime: "18:00",
    periodDuration: 60,
    lunchAfterPeriod: 4,
    lunchDuration: 60,
    gapDuration: 15
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
  const slot3 = result1.slots.find(s => s.id === 3);
  if (slot3) {
    const overlapping = getSlotsInTimeRange(result1.slots, 'Monday', slot3.id);
    console.log(`  Slot ${slot3.id} (${slot3.label}) overlaps with: ${overlapping.join(', ')}`);
  }

  // Test 3: Early dismissal
  console.log('\nTest 3: Early dismissal (9:00-14:00)');
  const config3 = {
    startTime: "09:00",
    endTime: "14:00",
    periodDuration: 60,
    lunchAfterPeriod: 3,
    lunchDuration: 45,
    gapDuration: 15
  };
  const result3 = generateTimeSlots(config3);
  console.log(`Total slots: ${result3.slots.length}`);
  console.log('Slots:');
  result3.slots.forEach(s => {
    console.log(`  ${s.id}: ${s.label} (${s.duration}min)${s.is_break ? ' (BREAK)' : ''}`);
  });

  console.log('\n=== All tests complete! ===');
}
