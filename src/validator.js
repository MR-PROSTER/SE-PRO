/**
 * validator.js - Validates timetable entries for conflicts and missing hours
 */

/**
 * Validate a timetable for conflicts and missing hours
 * @param {Array} entries - Timetable entries from generateTimetable
 * @param {Array} courses - Original courses array with L/T/P requirements
 * @returns {{ valid: boolean, conflicts: Array, missingHours: Array }}
 */
function validateTimetable(entries, courses) {
  const conflicts = [];
  const missingHours = [];

  // Helper to get slots as array (for practicals with 2 slots)
  const getSlots = (entry) => Array.isArray(entry.slot_id) ? entry.slot_id : [entry.slot_id];

  // Helper to check if two semester-half values conflict
  // - semHalf=0 (full) conflicts with all (0, 1, 2)
  // - semHalf=1 (H1) and semHalf=2 (H2) do NOT conflict (different calendar periods)
  // - Same semHalf values conflict (1==1, 2==2)
  function semesterHalfConflicts(semHalf1, semHalf2) {
    if (semHalf1 === 0 || semHalf2 === 0) {
      return true; // Full semester conflicts with everything
    }
    if (semHalf1 !== semHalf2) {
      return false; // H1 and H2 don't conflict
    }
    return true; // Same half conflicts
  }

  // 1. Check faculty double-booking with semester-half awareness
  const facultyMap = new Map();
  for (const entry of entries) {
    const key = `${entry.faculty_id}-${entry.day}`;
    if (!facultyMap.has(key)) {
      facultyMap.set(key, []);
    }
    facultyMap.get(key).push(entry);
  }

  for (const [key, facultyEntries] of facultyMap) {
    const slotMap = new Map();
    for (const entry of facultyEntries) {
      const slots = getSlots(entry);
      for (const slot of slots) {
        if (!slotMap.has(slot)) {
          slotMap.set(slot, []);
        }
        slotMap.get(slot).push(entry);
      }
    }

    for (const [slot, slotEntries] of slotMap) {
      if (slotEntries.length > 1) {
        // Check if it's the same course (elective sync - allowed, faculty teaches same course to multiple sections)
        const uniqueCourses = [...new Set(slotEntries.map(e => e.course_code))];
        if (uniqueCourses.length > 1) {
          // Check semester-half conflicts
          const semHalfValues = slotEntries.map(e => e.semester_half || 0);
          let hasConflict = false;

          // Check all pairs for semester-half conflicts
          for (let i = 0; i < semHalfValues.length; i++) {
            for (let j = i + 1; j < semHalfValues.length; j++) {
              if (semesterHalfConflicts(semHalfValues[i], semHalfValues[j])) {
                hasConflict = true;
                break;
              }
            }
            if (hasConflict) break;
          }

          if (hasConflict) {
            const semHalfLabels = slotEntries.map(e => {
              const h = e.semester_half || 0;
              return h === 0 ? 'Full' : h === 1 ? 'H1' : 'H2';
            });
            conflicts.push({
              type: 'FACULTY_DOUBLE_BOOKING',
              severity: 'ERROR',
              description: `Faculty ${slotEntries[0].faculty_id} is scheduled for multiple courses at the same time with conflicting semester halves`,
              affected: {
                faculty_id: slotEntries[0].faculty_id,
                day: slotEntries[0].day,
                slot,
                entries: slotEntries.map(e => `${e.course_code}-${e.section} (${semHalfLabels[slotEntries.indexOf(e)]})`),
                semester_halves: semHalfValues
              }
            });
          }
          // Note: H1 + H2 sharing is VALID - do not flag
        }
      }
    }
  }

  // 2. Check section double-booking with semester-half awareness
  const sectionMap = new Map();
  for (const entry of entries) {
    const key = `${entry.section}-${entry.day}`;
    if (!sectionMap.has(key)) {
      sectionMap.set(key, []);
    }
    sectionMap.get(key).push(entry);
  }

  for (const [key, sectionEntries] of sectionMap) {
    const slotMap = new Map();
    for (const entry of sectionEntries) {
      const slots = getSlots(entry);
      for (const slot of slots) {
        if (!slotMap.has(slot)) {
          slotMap.set(slot, []);
        }
        slotMap.get(slot).push(entry);
      }
    }

    for (const [slot, slotEntries] of slotMap) {
      if (slotEntries.length > 1) {
        // Check if it's the same course (elective sync - allowed)
        const uniqueCourses = [...new Set(slotEntries.map(e => e.course_code))];
        if (uniqueCourses.length > 1) {
          // Check semester-half conflicts
          const semHalfValues = slotEntries.map(e => e.semester_half || 0);
          let hasConflict = false;

          // Check all pairs for semester-half conflicts
          for (let i = 0; i < semHalfValues.length; i++) {
            for (let j = i + 1; j < semHalfValues.length; j++) {
              if (semesterHalfConflicts(semHalfValues[i], semHalfValues[j])) {
                hasConflict = true;
                break;
              }
            }
            if (hasConflict) break;
          }

          if (hasConflict) {
            const semHalfLabels = slotEntries.map(e => {
              const h = e.semester_half || 0;
              return h === 0 ? 'Full' : h === 1 ? 'H1' : 'H2';
            });
            conflicts.push({
              type: 'SECTION_DOUBLE_BOOKING',
              severity: 'ERROR',
              description: `Section ${slotEntries[0].section} has multiple courses at the same time with conflicting semester halves`,
              affected: {
                section: slotEntries[0].section,
                day: slotEntries[0].day,
                slot,
                courses: slotEntries.map(e => `${e.course_code} (${semHalfLabels[slotEntries.indexOf(e)]})`).join(', ')
              }
            });
          }
          // Note: H1 + H2 sharing is VALID - do not flag
        }
      }
    }
  }

  // 3. Check room double-booking with semester-half awareness
  const roomMap = new Map();
  for (const entry of entries) {
    const key = `${entry.room_id}-${entry.day}`;
    if (!roomMap.has(key)) {
      roomMap.set(key, []);
    }
    roomMap.get(key).push(entry);
  }

  for (const [key, roomEntries] of roomMap) {
    const slotMap = new Map();
    for (const entry of roomEntries) {
      const slots = getSlots(entry);
      for (const slot of slots) {
        if (!slotMap.has(slot)) {
          slotMap.set(slot, []);
        }
        slotMap.get(slot).push(entry);
      }
    }

    for (const [slot, slotEntries] of slotMap) {
      if (slotEntries.length > 1) {
        // Check semester-half conflicts
        const semHalfValues = slotEntries.map(e => e.semester_half || 0);
        let hasConflict = false;

        // Check all pairs for semester-half conflicts
        for (let i = 0; i < semHalfValues.length; i++) {
          for (let j = i + 1; j < semHalfValues.length; j++) {
            if (semesterHalfConflicts(semHalfValues[i], semHalfValues[j])) {
              hasConflict = true;
              break;
            }
          }
          if (hasConflict) break;
        }

        if (hasConflict) {
          const semHalfLabels = slotEntries.map(e => {
            const h = e.semester_half || 0;
            return h === 0 ? 'Full' : h === 1 ? 'H1' : 'H2';
          });
          conflicts.push({
            type: 'ROOM_DOUBLE_BOOKING',
            severity: 'ERROR',
            description: `Room ${slotEntries[0].room_name} is booked for multiple courses at the same time with conflicting semester halves`,
            affected: {
              room_id: slotEntries[0].room_id,
              room_name: slotEntries[0].room_name,
              day: slotEntries[0].day,
              slot,
              entries: slotEntries.map(e => `${e.course_code}-${e.section} (${semHalfLabels[slotEntries.indexOf(e)]})`),
              semester_halves: semHalfValues
            }
          });
        }
        // Note: H1 + H2 sharing is VALID - do not flag
      }
    }
  }

  // 4. Check missing hours for each course
  const courseMap = new Map();
  for (const course of courses) {
    const key = `${course.course_code}-${course.section}`;
    courseMap.set(key, course);
  }

  // Count allocated hours per course-section
  const allocatedMap = new Map();
  for (const entry of entries) {
    const key = `${entry.course_code}-${entry.section}`;
    if (!allocatedMap.has(key)) {
      allocatedMap.set(key, { L: 0, T: 0, P: 0 });
    }
    const counts = allocatedMap.get(key);
    if (entry.type === 'L' || entry.type === 'T') {
      counts[entry.type] += 1;
    } else if (entry.type === 'P') {
      // Practical counts as 2 hours (2 consecutive slots)
      counts.P += 1;
    }
  }

  for (const [key, course] of courseMap) {
    const allocated = allocatedMap.get(key) || { L: 0, T: 0, P: 0 };

    if (allocated.L < course.L) {
      missingHours.push({
        course_code: course.course_code,
        section: course.section,
        type: 'L',
        required: course.L,
        allocated: allocated.L
      });
    }
    if (allocated.T < course.T) {
      missingHours.push({
        course_code: course.course_code,
        section: course.section,
        type: 'T',
        required: course.T,
        allocated: allocated.T
      });
    }
    if (allocated.P < course.P) {
      missingHours.push({
        course_code: course.course_code,
        section: course.section,
        type: 'P',
        required: course.P,
        allocated: allocated.P
      });
    }
  }

  // 5. Check room capacity vs enrolled students
  // Build a map of course-section to students_enrolled
  const courseEnrolledMap = new Map();
  for (const course of courses) {
    const key = `${course.course_code}-${course.section}`;
    // Use students_enrolled if available, otherwise section_strength
    courseEnrolledMap.set(key, course.students_enrolled || course.section_strength || 0);
  }

  // Track combined courses for logging
  const combinedCoursesLogged = new Set();

  // Check each entry for capacity issues
  for (const entry of entries) {
    let enrolledCount;

    // For combined courses, use the combined_enrollment directly
    if (entry.is_combined === true && entry.combined_enrollment !== undefined) {
      enrolledCount = entry.combined_enrollment;

      // Log combined courses once
      const logKey = entry.course_code;
      if (!combinedCoursesLogged.has(logKey)) {
        combinedCoursesLogged.add(logKey);
        console.log(
          `  Combined course: ${entry.course_code} - sections [${entry.combined_sections?.join(', ')}] ` +
          `sharing same slot, total enrollment: ${enrolledCount}`
        );
      }
    } else {
      // Regular course - look up from course map
      const key = `${entry.course_code}-${entry.section}`;
      enrolledCount = courseEnrolledMap.get(key);

      if (enrolledCount === undefined) {
        continue; // Skip if we don't have enrolled data
      }
    }

    const roomCapacity = entry.room_capacity || 0;

    // ERROR: enrolled > room.capacity (under-capacity)
    if (enrolledCount > 0 && roomCapacity > 0 && enrolledCount > roomCapacity) {
      conflicts.push({
        type: 'ROOM_UNDER_CAPACITY',
        severity: 'ERROR',
        description: `Room ${entry.room_name} (capacity ${roomCapacity}) is too small for ${entry.course_code} (${entry.section}) with ${enrolledCount} students`,
        affected: {
          room_id: entry.room_id,
          room_name: entry.room_name,
          course_code: entry.course_code,
          section: entry.section,
          room_capacity: roomCapacity,
          enrolled_students: enrolledCount
        }
      });
    }

    // WARNING: hall assigned but enrolled <= 48 (should be in classroom)
    const roomTypeLower = (entry.room_type || '').toLowerCase();
    const isHall = roomTypeLower.includes('hall');
    if (isHall && enrolledCount > 0 && enrolledCount <= 48) {
      conflicts.push({
        type: 'ROOM_HALL_WASTAGE',
        severity: 'WARNING',
        description: `Room ${entry.room_name} is a hall but ${entry.course_code} (${entry.section}) has only ${enrolledCount} students - should be in classroom`,
        affected: {
          room_id: entry.room_id,
          room_name: entry.room_name,
          course_code: entry.course_code,
          section: entry.section,
          room_type: entry.room_type,
          enrolled_students: enrolledCount
        }
      });
    }

    // WARNING: severe capacity wastage (room > 2x enrolled)
    if (enrolledCount > 0 && roomCapacity > 0 && roomCapacity > enrolledCount * 2) {
      conflicts.push({
        type: 'ROOM_WASTAGE',
        severity: 'WARNING',
        description: `Room ${entry.room_name} (capacity ${roomCapacity}) is too large for ${entry.course_code} (${entry.section}) with ${enrolledCount} students`,
        affected: {
          room_id: entry.room_id,
          room_name: entry.room_name,
          course_code: entry.course_code,
          section: entry.section,
          room_capacity: roomCapacity,
          enrolled_students: enrolledCount,
          utilization: Math.round((enrolledCount / roomCapacity) * 100) + '%'
        }
      });
    }

    // Check facility mismatch for labs
    if (entry.type === 'P' && entry.room_type && entry.room_type.toLowerCase().includes('lab')) {
      const courseTitle = entry.course_name || '';
      const roomFacilities = entry.room_facilities || [];

      // Check if course title suggests Computers lab
      const computersKeywords = ['computer', 'programming', 'software', 'data', 'algorithm', 'database', 'web', 'cloud', 'ai', 'ml'];
      const hardwareKeywords = ['hardware', 'circuit', 'embedded', 'iot', 'sensor', 'device', 'vlsi', 'rf', 'analog', 'digital'];

      const titleLower = courseTitle.toLowerCase();
      const wantsComputers = computersKeywords.some(k => titleLower.includes(k));
      const wantsHardware = hardwareKeywords.some(k => titleLower.includes(k));

      const hasComputers = roomFacilities.some(f => f.toLowerCase().includes('computers'));
      const hasHardware = roomFacilities.some(f => f.toLowerCase().includes('hardware'));

      if (wantsComputers && hasHardware && !hasComputers) {
        conflicts.push({
          type: 'LAB_FACILITY_MISMATCH',
          severity: 'WARNING',
          description: `Hardware lab assigned to ${entry.course_code} (${courseTitle}) - should be Computers lab`,
          affected: {
            course_code: entry.course_code,
            course_title: courseTitle,
            room_id: entry.room_id,
            room_name: entry.room_name,
            room_facilities: roomFacilities,
            expected_facility: 'Computers'
          }
        });
      }

      if (wantsHardware && hasComputers && !hasHardware) {
        conflicts.push({
          type: 'LAB_FACILITY_MISMATCH',
          severity: 'WARNING',
          description: `Computers lab assigned to ${entry.course_code} (${courseTitle}) - should be Hardware lab`,
          affected: {
            course_code: entry.course_code,
            course_title: courseTitle,
            room_id: entry.room_id,
            room_name: entry.room_name,
            room_facilities: roomFacilities,
            expected_facility: 'Hardware'
          }
        });
      }
    }
  }

  return {
    valid: conflicts.length === 0 && missingHours.length === 0,
    conflicts,
    missingHours
  };
}

/**
 * Validate exam schedule entries
 * @param {Array} examEntries - Exam entries with date, slot, room, sections[]
 * @returns {{ valid: boolean, conflicts: Array }}
 */
function validateExamSchedule(examEntries) {
  const conflicts = [];

  // 1. Check same section has more than 1 exam on same date
  const sectionDateMap = new Map();
  for (const exam of examEntries) {
    // exam.sections is an array
    const sections = Array.isArray(exam.sections) ? exam.sections : [exam.sections];
    for (const section of sections) {
      const key = `${section}-${exam.date}`;
      if (!sectionDateMap.has(key)) {
        sectionDateMap.set(key, []);
      }
      sectionDateMap.get(key).push({ ...exam, section });
    }
  }

  for (const [key, exams] of sectionDateMap) {
    if (exams.length > 1) {
      const [section] = key.split('-');
      const courseList = exams.map(e => e.course_code).join(', ');
      conflicts.push({
        type: 'SECTION_MULTIPLE_EXAMS',
        description: `Section ${section} has multiple exams on ${exams[0].date}`,
        affected: {
          section,
          date: exams[0].date,
          courses: courseList
        }
      });
    }
  }

  // 2. Check more than 4 exams globally on same date
  const dateMap = new Map();
  for (const exam of examEntries) {
    if (!dateMap.has(exam.date)) {
      dateMap.set(exam.date, []);
    }
    dateMap.get(exam.date).push(exam);
  }

  for (const [date, exams] of dateMap) {
    if (exams.length > 4) {
      conflicts.push({
        type: 'EXAM_OVERLOAD',
        description: `More than 4 exams scheduled on ${date}`,
        affected: {
          date,
          examCount: exams.length,
          courses: exams.map(e => e.course_code).join(', ')
        }
      });
    }
  }

  // 3. Check room double-booking on same date+slot
  const roomDateSlotMap = new Map();
  for (const exam of examEntries) {
    // exam.rooms is an array
    const rooms = Array.isArray(exam.rooms) ? exam.rooms : [exam.rooms];
    for (const roomId of rooms) {
      const key = `${roomId}-${exam.date}-${exam.slot}`;
      if (!roomDateSlotMap.has(key)) {
        roomDateSlotMap.set(key, []);
      }
      roomDateSlotMap.get(key).push({ ...exam, room_id: roomId });
    }
  }

  for (const [key, exams] of roomDateSlotMap) {
    if (exams.length > 1) {
      const [roomId] = key.split('-');
      conflicts.push({
        type: 'ROOM_DOUBLE_BOOKING',
        description: `Room ${roomId} has multiple exams at the same time`,
        affected: {
          room_id: roomId,
          key,
          courses: exams.map(e => e.course_code).join(', ')
        }
      });
    }
  }

  return {
    valid: conflicts.length === 0,
    conflicts
  };
}

/**
 * Comprehensive validation that returns a structured report
 * @param {Array} entries - Timetable entries from generateTimetable
 * @param {Array} courses - Original courses array with L/T/P requirements
 * @param {Array} rooms - All rooms from dataLoader
 * @param {Object} timeSlots - Time slots config
 * @returns {{
 *   valid: boolean,
 *   errors: Array,
 *   warnings: Array,
 *   info: Array,
 *   stats: {
 *     totalEntries: number,
 *     roomUtilization: Object,
 *     facultyLoad: Object,
 *     sectionHours: Object,
 *     unscheduledCourses: Array
 *   }
 * }}
 */
function validateAll(entries, courses, rooms, timeSlots) {
  const errors = [];
  const warnings = [];
  const info = [];

  // Run basic validation first
  const basicResult = validateTimetable(entries, courses);

  // Separate errors and warnings from basic validation
  for (const conflict of basicResult.conflicts) {
    if (conflict.severity === 'ERROR') {
      errors.push({
        type: conflict.type,
        description: conflict.description,
        affected: conflict.affected
      });
    } else {
      warnings.push({
        type: conflict.type,
        description: conflict.description,
        affected: conflict.affected
      });
    }
  }

  // Add missing hours as errors
  for (const missing of basicResult.missingHours) {
    errors.push({
      type: 'MISSING_HOURS',
      description: `${missing.course_code} (${missing.section}) missing ${missing.type} hours: required ${missing.required}, allocated ${missing.allocated}`,
      affected: missing
    });
  }

  // Calculate statistics
  const stats = calculateTimetableStats(entries, courses, rooms, timeSlots);

  // Add info messages for statistics
  info.push(`Total scheduled entries: ${stats.totalEntries}`);
  info.push(`Total unique courses scheduled: ${stats.uniqueCourses}`);
  info.push(`Room utilization: ${stats.averageRoomUtilization}%`);
  info.push(`Faculty with highest load: ${stats.highestFacultyLoad.faculty_id} (${stats.highestFacultyLoad.hours} hours)`);

  // Check for unscheduled courses
  const scheduledCourses = new Set(entries.map(e => `${e.course_code}-${e.section}`));
  const allCourses = new Set(courses.map(c => `${c.course_code}-${c.section}`));
  const unscheduledCourses = [];

  for (const courseKey of allCourses) {
    if (!scheduledCourses.has(courseKey)) {
      const [courseCode, section] = courseKey.split('-');
      unscheduledCourses.push({ course_code: courseCode, section });
    }
  }

  if (unscheduledCourses.length > 0) {
    warnings.push({
      type: 'UNSCHEDULED_COURSES',
      description: `${unscheduledCourses.length} courses were not scheduled`,
      affected: { courses: unscheduledCourses }
    });
  }

  // Check for room under-utilization
  const roomUsage = new Map();
  for (const entry of entries) {
    const key = entry.room_id;
    if (!roomUsage.has(key)) {
      roomUsage.set(key, { name: entry.room_name, capacity: entry.room_capacity, usage: 0 });
    }
    roomUsage.get(key).usage++;
  }

  for (const [roomId, data] of roomUsage) {
    const utilization = Math.round((data.usage / (5 * timeSlots.slots.length)) * 100);
    if (utilization < 10) {
      info.push(`Room ${data.name} is under-utilized (${utilization}% of available slots)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
    stats
  };
}

/**
 * Calculate comprehensive timetable statistics
 * @param {Array} entries - Timetable entries
 * @param {Array} courses - Courses array
 * @param {Array} rooms - Rooms array
 * @param {Object} timeSlots - Time slots config
 * @returns {Object} Statistics object
 */
function calculateTimetableStats(entries, courses, rooms, timeSlots) {
  const stats = {
    totalEntries: entries.length,
    uniqueCourses: new Set(entries.map(e => e.course_code)).size,

    // Room utilization
    roomUtilization: {},
    averageRoomUtilization: 0,

    // Faculty load
    facultyLoad: {},
    highestFacultyLoad: { faculty_id: '', hours: 0 },

    // Section hours
    sectionHours: {},

    // Course distribution by type
    courseTypeDistribution: { L: 0, T: 0, P: 0 },

    // Semester half distribution
    semesterHalfDistribution: { full: 0, h1: 0, h2: 0 }
  };

  // Calculate room utilization
  const roomUsage = new Map();
  const totalAvailableSlots = 5 * timeSlots.slots.length; // 5 days * number of slots

  for (const entry of entries) {
    // Room utilization
    if (!roomUsage.has(entry.room_id)) {
      roomUsage.set(entry.room_id, {
        room_id: entry.room_id,
        room_name: entry.room_name,
        capacity: entry.room_capacity,
        slotsUsed: 0,
        totalEnrollment: 0
      });
    }
    roomUsage.get(entry.room_id).slotsUsed++;
    roomUsage.get(entry.room_id).totalEnrollment += entry.is_combined
      ? (entry.combined_enrollment || 0)
      : (entry.students_enrolled || 0);

    // Faculty load
    if (!stats.facultyLoad[entry.faculty_id]) {
      stats.facultyLoad[entry.faculty_id] = {
        faculty_id: entry.faculty_id,
        hours: 0,
        courses: new Set()
      };
    }
    const duration = entry.duration || 60;
    stats.facultyLoad[entry.faculty_id].hours += duration / 60;
    stats.facultyLoad[entry.faculty_id].courses.add(entry.course_code);

    // Section hours
    const sectionKey = `${entry.section}-${entry.semester_half || 0}`;
    if (!stats.sectionHours[sectionKey]) {
      stats.sectionHours[sectionKey] = {
        section: entry.section,
        semester_half: entry.semester_half || 0,
        L: 0,
        T: 0,
        P: 0
      };
    }
    if (entry.type === 'L') {
      stats.sectionHours[sectionKey].L += duration / 60;
    } else if (entry.type === 'T') {
      stats.sectionHours[sectionKey].T += duration / 60;
    } else if (entry.type === 'P') {
      stats.sectionHours[sectionKey].P += 1.5; // Practical is 1.5hr block
    }

    // Course type distribution
    stats.courseTypeDistribution[entry.type]++;

    // Semester half distribution
    if (entry.semester_half === 0) {
      stats.semesterHalfDistribution.full++;
    } else if (entry.semester_half === 1) {
      stats.semesterHalfDistribution.h1++;
    } else if (entry.semester_half === 2) {
      stats.semesterHalfDistribution.h2++;
    }
  }

  // Convert room usage to utilization percentages
  let totalUtilization = 0;
  let roomCount = 0;
  for (const [roomId, data] of roomUsage) {
    const utilization = Math.round((data.slotsUsed / totalAvailableSlots) * 100);
    stats.roomUtilization[roomId] = {
      room_name: data.room_name,
      capacity: data.capacity,
      slots_used: data.slotsUsed,
      utilization_percentage: utilization,
      average_enrollment: Math.round(data.totalEnrollment / data.slotsUsed)
    };
    totalUtilization += utilization;
    roomCount++;
  }
  stats.averageRoomUtilization = roomCount > 0 ? Math.round(totalUtilization / roomCount) : 0;

  // Find highest faculty load
  for (const [facultyId, load] of Object.entries(stats.facultyLoad)) {
    load.courses = Array.from(load.courses); // Convert Set to Array for serialization
    if (load.hours > stats.highestFacultyLoad.hours) {
      stats.highestFacultyLoad = { faculty_id: facultyId, hours: load.hours };
    }
  }

  return stats;
}

module.exports = {
  validateTimetable,
  validateExamSchedule,
  validateAll,
  calculateTimetableStats
};

// Test code - runs only when executed directly
if (require.main === module) {
  console.log('=== Validator Tests ===\n');

  const { generateTimetable } = require('./timetable');
  const { loadRooms, loadFaculty, loadTimeSlots, loadAllCourses } = require('./dataLoader');

  (async () => {
    try {
      const rooms = await loadRooms();
      const faculty = await loadFaculty();
      const timeSlots = await loadTimeSlots();
      const courses = await loadAllCourses();

      console.log('Generating timetable...');
      const timetable = generateTimetable(courses, rooms, timeSlots);

      console.log('\n=== Validating Timetable ===\n');
      const result = validateTimetable(timetable, courses);

      console.log(`Valid: ${result.valid}`);
      console.log(`Conflicts: ${result.conflicts.length}`);
      console.log(`Missing Hours: ${result.missingHours.length}`);

      if (result.conflicts.length > 0) {
        console.log('\nConflicts:');
        result.conflicts.forEach(c => {
          console.log(`  [${c.type}] ${c.description}`);
          console.log(`    Affected: ${JSON.stringify(c.affected)}`);
        });
      }

      if (result.missingHours.length > 0) {
        console.log('\nMissing Hours:');
        result.missingHours.forEach(m => {
          console.log(`  ${m.course_code} (${m.section}): ${m.type} - required ${m.required}, allocated ${m.allocated}`);
        });
      }

      // Test 2: validateExamSchedule
      console.log('\n=== Exam Schedule Validation ===\n');

      const mockExams = [
        { course_code: 'CS101', section: 'CSEA-I', date: '2025-05-01', slot: 1, room_id: 'R101' },
        { course_code: 'CS102', section: 'CSEA-I', date: '2025-05-02', slot: 1, room_id: 'R101' },
        { course_code: 'CS103', section: 'CSEA-I', date: '2025-05-03', slot: 1, room_id: 'R101' },
        { course_code: 'CS104', section: 'CSEA-I', date: '2025-05-04', slot: 1, room_id: 'R101' },
        { course_code: 'CS105', section: 'CSEA-I', date: '2025-05-04', slot: 2, room_id: 'R102' },
        // Conflict: same section, same date
        { course_code: 'CS101', section: 'CSEB-I', date: '2025-05-01', slot: 2, room_id: 'R102' },
        { course_code: 'CS102', section: 'CSEB-I', date: '2025-05-01', slot: 3, room_id: 'R102' },
        // Conflict: room double booking
        { course_code: 'CS103', section: 'CSEB-I', date: '2025-05-03', slot: 1, room_id: 'R101' }
      ];

      const examResult = validateExamSchedule(mockExams);
      console.log(`Exam Schedule Valid: ${examResult.valid}`);
      console.log(`Exam Conflicts: ${examResult.conflicts.length}`);

      if (examResult.conflicts.length > 0) {
        console.log('\nExam Conflicts:');
        examResult.conflicts.forEach(c => {
          console.log(`  [${c.type}] ${c.description}`);
        });
      }

      console.log('\n=== All tests complete! ===');
    } catch (error) {
      console.error('Error:', error.message);
      console.error(error.stack);
    }
  })();
}
