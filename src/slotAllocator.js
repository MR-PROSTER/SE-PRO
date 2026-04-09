/**
 * SlotAllocator - Core slot allocation engine for timetable generation
 * Manages booking state for faculty, sections, and rooms with time-range blocking
 * Supports semester-half scheduling (H1, H2, full-semester)
 */
const { getSlotsInTimeRange, timeToMinutes } = require('./timeSlotGenerator');

/**
 * Check if two semester-half values conflict
 * @param {number} semHalf1 - First semester half (0=full, 1=H1, 2=H2)
 * @param {number} semHalf2 - Second semester half (0=full, 1=H1, 2=H2)
 * @returns {boolean} true if they conflict, false if they can coexist
 */
function semesterHalfConflicts(semHalf1, semHalf2) {
  // Full-semester (0) conflicts with everything
  if (semHalf1 === 0 || semHalf2 === 0) {
    return true;
  }
  // H1 and H2 don't conflict (different calendar periods)
  if (semHalf1 !== semHalf2) {
    return false;
  }
  // Same half (1==1 or 2==2) conflicts
  return true;
}

class SlotAllocator {
  /**
   * @param {Object} timeSlots - { days: string[], slots: {id, label, duration, start, end}[], breakSlots: [] }
   */
  constructor(timeSlots) {
    this.days = timeSlots.days;
    this.slots = timeSlots.slots;
    this.breakSlotIds = new Set(
      (timeSlots.breakSlots || []).map(s => s.id)
    );

    // Booking maps: Map<key, Set<"semHalf-day-slot">>
    // Key includes semesterHalf to allow H1/H2 to share slots
    this.facultyBookings = new Map();
    this.sectionBookings = new Map();
    this.roomBookings = new Map();

    // Track blocked slots (distinct from booked) - Map<key, Set<"semHalf-day-slot">>
    this.facultyBlocked = new Map();
    this.sectionBlocked = new Map();
    this.roomBlocked = new Map();
  }

  /**
   * Create a key for booking maps
   * @param {string} day
   * @param {number} slotId
   * @param {number} semesterHalf - 0=full, 1=H1, 2=H2
   * @returns {string}
   */
  _makeKey(day, slotId, semesterHalf = 0) {
    return `${semesterHalf}-${day}-${slotId}`;
  }

  /**
   * Get or create a Set for a given map and key
   * @param {Map} map
   * @param {string} key
   * @returns {Set<string>}
   */
  _getBookings(map, key) {
    if (!map.has(key)) {
      map.set(key, new Set());
    }
    return map.get(key);
  }

  /**
   * Get all slot IDs that overlap with a given slot's time range
   * @param {string} day
   * @param {number} slotId
   * @returns {Array<number>}
   */
  _getOverlappingSlots(day, slotId) {
    return getSlotsInTimeRange(this.slots, day, slotId);
  }

  /**
   * Check if a slot is free for all three constraints
   * Books a slot for faculty, section, and room - blocks full time range
   * @param {string} facultyId
   * @param {string} section
   * @param {string} roomId
   * @param {string} day
   * @param {number} slotId
   * @param {number} semesterHalf - 0=full, 1=H1, 2=H2
   */
  bookSlot(facultyId, section, roomId, day, slotId, semesterHalf = 0) {
    // Get all overlapping slots for the time range
    const overlappingSlotIds = this._getOverlappingSlots(day, slotId);

    for (const overlappingSlotId of overlappingSlotIds) {
      const key = this._makeKey(day, overlappingSlotId, semesterHalf);

      this._getBookings(this.facultyBookings, facultyId).add(key);
      this._getBookings(this.sectionBookings, section).add(key);
      this._getBookings(this.roomBookings, roomId).add(key);
    }
  }

  /**
   * Check if a slot is free for all three constraints
   * Checks ALL slots that overlap with the given slot's time range
   * Uses semester-half conflict matrix:
   *   - semHalf=0 (full) conflicts with all (0, 1, 2)
   *   - semHalf=1 (H1) and semHalf=2 (H2) do NOT conflict
   *   - Same semHalf values conflict (1==1, 2==2)
   * @param {string} facultyId
   * @param {string} section
   * @param {string} roomId
   * @param {string} day
   * @param {number} slotId
   * @param {number} semesterHalf - 0=full, 1=H1, 2=H2
   * @returns {boolean} true if slot is free
   */
  isSlotFree(facultyId, section, roomId, day, slotId, semesterHalf = 0) {
    // Get all overlapping slots for the time range
    const overlappingSlotIds = this._getOverlappingSlots(day, slotId);

    for (const overlappingSlotId of overlappingSlotIds) {
      // Check faculty conflicts
      const facultyKeys = this._getBookings(this.facultyBookings, facultyId);
      for (const bookedKey of facultyKeys) {
        const [bookedSemHalf, bookedDay, bookedSlot] = bookedKey.split('-');
        const bookedSemHalfNum = parseInt(bookedSemHalf, 10);
        const bookedDayStr = bookedDay;
        const bookedSlotNum = parseInt(bookedSlot, 10);
        if (bookedDayStr === day && bookedSlotNum === overlappingSlotId) {
          if (semesterHalfConflicts(semesterHalf, bookedSemHalfNum)) {
            return false;
          }
        }
      }

      // Check section conflicts
      const sectionKeys = this._getBookings(this.sectionBookings, section);
      for (const bookedKey of sectionKeys) {
        const [bookedSemHalf, bookedDay, bookedSlot] = bookedKey.split('-');
        const bookedSemHalfNum = parseInt(bookedSemHalf, 10);
        const bookedDayStr = bookedDay;
        const bookedSlotNum = parseInt(bookedSlot, 10);
        if (bookedDayStr === day && bookedSlotNum === overlappingSlotId) {
          if (semesterHalfConflicts(semesterHalf, bookedSemHalfNum)) {
            return false;
          }
        }
      }

      // Check room conflicts
      const roomKeys = this._getBookings(this.roomBookings, roomId);
      for (const bookedKey of roomKeys) {
        const [bookedSemHalf, bookedDay, bookedSlot] = bookedKey.split('-');
        const bookedSemHalfNum = parseInt(bookedSemHalf, 10);
        const bookedDayStr = bookedDay;
        const bookedSlotNum = parseInt(bookedSlot, 10);
        if (bookedDayStr === day && bookedSlotNum === overlappingSlotId) {
          if (semesterHalfConflicts(semesterHalf, bookedSemHalfNum)) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Find the first free slot for a given faculty and section
   * @param {string} facultyId
   * @param {string} section
   * @param {string} preferredRoomId - Room to check first (optional)
   * @param {number} duration - Required slot duration (60 or 90)
   * @returns {{day: string, slot: number, room_id: string} | null}
   */
  findFreeSlot(facultyId, section, preferredRoomId, duration = 60) {
    // Get all rooms from the roomBookings map keys
    const allRooms = Array.from(this.roomBookings.keys());

    // If preferred room exists and is not yet tracked, add it
    if (preferredRoomId && !this.roomBookings.has(preferredRoomId)) {
      allRooms.push(preferredRoomId);
    }

    // If no rooms tracked yet, we can't book - return null
    if (allRooms.length === 0) {
      return null;
    }

    // Filter slots by required duration and exclude break slots
    const eligibleSlots = this.slots.filter(s => s.duration === duration && !s.is_break);

    // Try each day
    for (const day of this.days) {
      // Try each slot with matching duration
      for (const slot of eligibleSlots) {
        // Try preferred room first, then others
        const roomOrder = [preferredRoomId, ...allRooms.filter(r => r !== preferredRoomId)].filter(Boolean);

        for (const roomId of roomOrder) {
          if (this.isSlotFree(facultyId, section, roomId, day, slot.id)) {
            return {
              day,
              slot: slot.id,
              room_id: roomId
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Find consecutive free slots for lab sessions
   * @param {string} facultyId
   * @param {string} section
   * @param {string} roomId
   * @param {number} count - Number of consecutive slots needed
   * @returns {Array<{day: string, slot: number}> | null}
   */
  findContiguousSlots(facultyId, section, roomId, count) {
    // Sort slots by id to ensure sequential ordering
    const sortedSlots = [...this.slots].sort((a, b) => a.id - b.id);

    for (const day of this.days) {
      // Find sequences of consecutive non-break slots
      let sequence = [];

      for (const slot of sortedSlots) {
        // Skip break slots
        if (this.breakSlotIds.has(slot.id)) {
          sequence = [];
          continue;
        }

        const key = this._makeKey(day, slot.id);
        const isFree = this.isSlotFree(facultyId, section, roomId, day, slot.id);

        if (!isFree) {
          sequence = [];
          continue;
        }

        // Check if this slot is consecutive with the previous
        if (sequence.length === 0 || slot.id === sequence[sequence.length - 1].slot + 1) {
          sequence.push({ day, slot: slot.id });
        } else {
          // Not consecutive, start new sequence
          sequence = [{ day, slot: slot.id }];
        }

        if (sequence.length === count) {
          return sequence;
        }
      }
    }

    return null;
  }

  /**
   * Get booking summary for debugging
   * @returns {Object} Summary of all bookings
   */
  getBookingSummary() {
    return {
      facultyBookings: Object.fromEntries(
        Array.from(this.facultyBookings.entries()).map(([k, v]) => [k, Array.from(v)])
      ),
      sectionBookings: Object.fromEntries(
        Array.from(this.sectionBookings.entries()).map(([k, v]) => [k, Array.from(v)])
      ),
      roomBookings: Object.fromEntries(
        Array.from(this.roomBookings.entries()).map(([k, v]) => [k, Array.from(v)])
      )
    };
  }
}

// Test code - runs only when executed directly
if (require.main === module) {
  console.log('=== SlotAllocator Tests (Time-Range Blocking) ===\n');

  const { generateTimeSlots } = require('./timeSlotGenerator');

  // Generate slots with dual duration
  const mockTimeSlots = generateTimeSlots({
    startTime: "09:00",
    endTime: "18:00",
    gapDuration: 15,
    breakAfterPeriod: 4,
    lunchDuration: 60
  });

  const allocator = new SlotAllocator(mockTimeSlots);

  // Initialize room bookings (simulate rooms from dataLoader)
  const rooms = ['R101', 'R102', 'L201', 'L202', 'H301'];
  rooms.forEach(r => {
    if (!allocator.roomBookings.has(r)) {
      allocator.roomBookings.set(r, new Set());
    }
  });

  console.log('Generated slots:');
  mockTimeSlots.slots.forEach(s => {
    console.log(`  ${s.id}: ${s.label} (${s.duration}min)`);
  });

  // Test 1: Initial slot should be free
  console.log('\nTest 1: isSlotFree (initial)');
  const slot60 = mockTimeSlots.slots.find(s => s.duration === 60);
  const free1 = allocator.isSlotFree('F01', 'CSEA-I', 'R101', 'Monday', slot60.id);
  console.log(`  Monday slot ${slot60.id} (${slot60.label}) free: ${free1} (expected: true)`);
  console.assert(free1 === true, 'Initial slot should be free');

  // Test 2: Book a 90min slot - should block overlapping 60min slot
  console.log('\nTest 2: bookSlot with 90min blocks overlapping 60min');
  const slot90 = mockTimeSlots.slots.find(s => s.duration === 90 && s.start === slot60.start);
  if (slot90) {
    allocator.bookSlot('F01', 'CSEA-I', 'R101', 'Monday', slot90.id);
    const busy60 = allocator.isSlotFree('F01', 'CSEA-I', 'R101', 'Monday', slot60.id);
    console.log(`  After booking 90min slot ${slot90.id}, 60min slot ${slot60.id} free: ${busy60} (expected: false)`);
    console.assert(busy60 === false, 'Overlapping slot should be blocked');
  }

  // Test 3: findFreeSlot with duration filter
  console.log('\nTest 3: findFreeSlot with duration=90');
  const found90 = allocator.findFreeSlot('F01', 'CSEA-I', 'R101', 90);
  console.log(`  Found 90min slot: ${JSON.stringify(found90)}`);
  if (slot90 && found90) {
    console.log(`  Expected: NOT slot ${slot90.id} (already booked)`);
    console.assert(found90.slot !== slot90.id, 'Should not return booked slot');
  }

  // Test 4: Same faculty busy, different section free
  console.log('\nTest 4: Faculty conflict');
  const facultyBusy = allocator.isSlotFree('F01', 'CSEB-I', 'R102', 'Monday', slot90.id);
  const sectionFree = allocator.isSlotFree('F02', 'CSEA-I', 'R101', 'Monday', slot90.id);
  console.log(`  F01 with CSEB-I: ${facultyBusy} (expected: false - faculty busy)`);
  console.log(`  F02 with CSEA-I: ${sectionFree} (expected: false - room busy)`);
  console.assert(facultyBusy === false, 'Faculty should be busy');
  console.assert(sectionFree === false, 'Room should be busy');

  // Test 5: findFreeSlot
  console.log('\nTest 5: findFreeSlot');
  const found = allocator.findFreeSlot('F01', 'CSEA-I', 'R101', 60);
  console.log(`  Found 60min slot: ${JSON.stringify(found)}`);
  console.assert(found !== null, 'Should find a free slot');

  // Test 6: findContiguousSlots
  console.log('\nTest 6: findContiguousSlots (need 2 consecutive)');
  const contiguous = allocator.findContiguousSlots('F02', 'CSEA-I', 'L201', 2);
  console.log(`  Found contiguous slots: ${JSON.stringify(contiguous)}`);
  console.assert(contiguous !== null, 'Should find contiguous slots');
  console.assert(contiguous.length === 2, 'Should return 2 slots');

  // Print summary
  console.log('\n=== Booking Summary ===');
  console.log(JSON.stringify(allocator.getBookingSummary(), null, 2));

  console.log('\n=== All tests passed! ===');
}

module.exports = SlotAllocator;
