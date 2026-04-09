/**
 * exportTimetable.js - Exports timetable to Excel using ExcelJS
 * Supports variable row heights for 1hr and 1.5hr slots
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs-extra');

// Preset palette of 15 colors for courses
const COLOR_PALETTE = [
  'FFB3BA', // Light pink
  'FFDFBA', // Light peach
  'FFFFBA', // Light yellow
  'BAFFCB', // Light green
  'BAE1FF', // Light blue
  'E2BAFF', // Light purple
  'FFBAE1', // Light magenta
  'FFA07A', // Light salmon
  '98FB98', // Pale green
  '87CEEB', // Sky blue
  'DDA0DD', // Plum
  'F0E68C', // Khaki
  'FFD700', // Gold
  'FF6347', // Tomato
  '9370DB'  // Medium purple
];

// Semester half colors
const H1_COLOR = 'BAE1FF'; // Light blue for First Half
const H2_COLOR = 'FFDAB9'; // Light orange/peach for Second Half

// Base row height for 1hr slots (in Excel points)
const BASE_ROW_HEIGHT = 25;
const ROW_HEIGHT_60MIN = BASE_ROW_HEIGHT;
const ROW_HEIGHT_90MIN = BASE_ROW_HEIGHT * 1.5;

/**
 * Generate a consistent color for a course code
 * @param {string} courseCode
 * @returns {string} Hex color code
 */
function getColorForCourse(courseCode) {
  // Use hash of course code to pick consistent color
  let hash = 0;
  for (let i = 0; i < courseCode.length; i++) {
    hash = courseCode.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

/**
 * Export timetable entries to Excel
 * @param {Array} entries - Timetable entries from generateTimetable
 * @param {Object} timeSlots - Time slots config
 * @param {string} outputPath - Path to save the Excel file
 * @returns {Promise<string>} Path to saved file
 */
async function exportTimetable(entries, timeSlots, outputPath) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Timetable Generator';
  workbook.created = new Date();

  // Get unique sections
  const sections = [...new Set(entries.map(e => e.section))].sort();

  // Get slot labels (only non-break slots)
  const slotLabels = timeSlots.slots.map(s => s.label);
  const slotIds = timeSlots.slots.map(s => s.id);
  const slotDurations = new Map(timeSlots.slots.map(s => [s.id, s.duration]));

  // Days in order
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  // Create Summary sheet FIRST (at the start)
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.getRow(1).values = ['Section', 'Total Courses', 'Total Weekly Hours', 'Shared Faculty Courses'];
  summarySheet.getRow(1).font = { bold: true };
  summarySheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  summarySheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  // Calculate summary data per section
  const sectionSummary = new Map();
  const facultyCoursesMap = new Map(); // faculty_id -> Set of course_codes

  for (const section of sections) {
    const sectionEntries = entries.filter(e => e.section === section);
    const uniqueCourses = new Set(sectionEntries.map(e => e.course_code));

    // Count weekly hours based on duration
    let totalHours = 0;
    for (const entry of sectionEntries) {
      const duration = entry.duration || 60;
      totalHours += duration / 60;
    }

    // Track faculty and their courses for shared faculty detection
    for (const entry of sectionEntries) {
      if (!facultyCoursesMap.has(entry.faculty_id)) {
        facultyCoursesMap.set(entry.faculty_id, new Set());
      }
      facultyCoursesMap.get(entry.faculty_id).add(`${entry.course_code}|${entry.section}`);
    }

    sectionSummary.set(section, {
      totalCourses: uniqueCourses.size,
      totalHours
    });
  }

  // Find sections with shared faculty (same faculty teaching in multiple sections)
  const sharedFacultyCourses = new Set();
  for (const [facultyId, courses] of facultyCoursesMap) {
    const sectionsSet = new Set();
    for (const courseSection of courses) {
      const [, section] = courseSection.split('|');
      sectionsSet.add(section);
    }
    if (sectionsSet.size > 1) {
      // This faculty teaches in multiple sections
      for (const courseSection of courses) {
        sharedFacultyCourses.add(courseSection);
      }
    }
  }

  // Fill summary rows
  let summaryRowIdx = 2;
  for (const section of sections) {
    const summary = sectionSummary.get(section);
    const row = summarySheet.getRow(summaryRowIdx);
    const hasSharedFaculty = [...facultyCoursesMap.entries()].some(([fid, courses]) => {
      const sectionsForThisFaculty = new Set([...courses].map(c => c.split('|')[1]));
      return sectionsForThisFaculty.has(section) && sectionsForThisFaculty.size > 1;
    });

    row.values = [
      section,
      summary.totalCourses,
      summary.totalHours,
      hasSharedFaculty ? 'Yes' : 'No'
    ];
    row.alignment = { vertical: 'middle', horizontal: 'center' };
    row.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    summaryRowIdx++;
  }

  // Set column widths for summary
  summarySheet.getColumn(1).width = 15;
  summarySheet.getColumn(2).width = 15;
  summarySheet.getColumn(3).width = 20;
  summarySheet.getColumn(4).width = 20;

  // Create a sheet for each section (after Summary)
  for (const section of sections) {
    const sheet = workbook.addWorksheet(section);

    // Set up header row
    sheet.getRow(1).values = ['Day \\ Slot', ...slotLabels];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Set column widths
    sheet.getColumn(1).width = 12;
    for (let i = 2; i <= slotLabels.length + 1; i++) {
      sheet.getColumn(i).width = 18;
    }

    // Create day rows with variable row heights based on slot duration
    // Each day row contains all slots, but we need to handle variable heights
    // Approach: Each "logical row" is actually multiple Excel rows for taller slots
    let currentExcelRow = 2;
    const dayToExcelRow = {};
    const slotToExcelRowOffset = {}; // Track vertical offset for each slot

    // Pre-calculate row positions for each day/slot combination
    // We use a cumulative approach: taller slots take more Excel rows
    for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
      const day = days[dayIndex];
      dayToExcelRow[day] = currentExcelRow;

      // All slots in a day start at the same row, but 90min slots will span more rows
      currentExcelRow++; // Move to next row for next day
    }

    // Fill in the timetable
    for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
      const day = days[dayIndex];
      const row = sheet.getRow(dayIndex + 2);
      row.values = [day, ...Array(slotLabels.length).fill('')];
      row.alignment = { vertical: 'middle', horizontal: 'center' };
      row.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      // Set row height based on maximum slot duration for this day
      // For simplicity, we'll set uniform row height per day based on the slots used
      row.height = BASE_ROW_HEIGHT;
    }

    // Filter entries for this section
    const sectionEntries = entries.filter(e => e.section === section);

    // Track which cells are filled (for lab merging and 1.5hr spanning)
    const filledCells = new Set();

    // Fill in the timetable
    for (const entry of sectionEntries) {
      const dayIndex = days.indexOf(entry.day);
      if (dayIndex === -1) continue;

      const row = dayIndex + 2;
      const duration = entry.duration || 60;
      const is90Min = duration === 90;

      // Handle single slot or multiple slots (lab)
      const slots = Array.isArray(entry.slot_id) ? entry.slot_id : [entry.slot_id];

      for (let i = 0; i < slots.length; i++) {
        const slotId = slots[i];
        const slotIndex = slotIds.indexOf(slotId);
        if (slotIndex === -1) continue;

        const col = slotIndex + 2; // +2 because col 1 is day name
        const cellKey = `${row}-${col}`;

        if (filledCells.has(cellKey)) continue;

        const cell = sheet.getCell(row, col);

        // Show duration in cell label
        const durationLabel = is90Min ? ' (1.5hr)' : ' (1hr)';

        // Add semester half indicator
        const semHalf = entry.semester_half || 0;
        const semHalfLabel = semHalf === 1 ? ' (H1)' : semHalf === 2 ? ' (H2)' : '';

        // Add combined course indicator
        const isCombined = entry.is_combined === true;
        const combinedLabel = isCombined ? ' (Combined)' : '';

        cell.value = `${entry.course_code}${durationLabel}${semHalfLabel}${combinedLabel}\n${entry.faculty_id}\n${entry.room_name}`;

        // Apply color for this course, with semester half overlay
        const baseColor = getColorForCourse(entry.course_code);

        // For H1/H2 courses, blend with semester half color
        let fillColor = baseColor;
        if (semHalf === 1) {
          // H1: Use light blue tint
          fillColor = H1_COLOR;
        } else if (semHalf === 2) {
          // H2: Use light orange tint
          fillColor = H2_COLOR;
        }

        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${fillColor}` }
        };

        // Set row height for 1.5hr slots
        if (is90Min) {
          row.height = ROW_HEIGHT_90MIN;
        } else {
          // Ensure row is at least the base height
          row.height = Math.max(row.height || 0, ROW_HEIGHT_60MIN);
        }

        // If this is a lab (multiple slots), merge cells
        if (slots.length > 1 && i === 0) {
          const nextSlotIndex = slotIds.indexOf(slots[1]);
          if (nextSlotIndex === slotIndex + 1) {
            // Consecutive slots - merge
            sheet.mergeCells(row, col, row, col + 1);
            filledCells.add(`${row}-${col + 1}`);
          }
        }

        filledCells.add(cellKey);
      }
    }

    // Apply borders to all cells
    // Track which cells have combined courses for thick border
    const combinedCells = new Set();
    for (const entry of sectionEntries) {
      if (entry.is_combined === true) {
        const dayIndex = days.indexOf(entry.day);
        if (dayIndex !== -1) {
          const row = dayIndex + 2;
          const slots = Array.isArray(entry.slot_id) ? entry.slot_id : [entry.slot_id];
          for (const slotId of slots) {
            const slotIndex = slotIds.indexOf(slotId);
            if (slotIndex !== -1) {
              const col = slotIndex + 2;
              combinedCells.add(`${row}-${col}`);
            }
          }
        }
      }
    }

    for (let row = 1; row <= days.length + 1; row++) {
      for (let col = 1; col <= slotLabels.length + 1; col++) {
        const cell = sheet.getCell(row, col);
        const cellKey = `${row}-${col}`;
        const isCombined = combinedCells.has(cellKey);

        cell.border = {
          top: { style: isCombined ? 'thick' : 'thin' },
          left: { style: isCombined ? 'thick' : 'thin' },
          bottom: { style: isCombined ? 'thick' : 'thin' },
          right: { style: isCombined ? 'thick' : 'thin' }
        };
      }
    }

    // Add note at bottom of sheet explaining H1/H2
    const noteRow = days.length + 3;
    const noteCell = sheet.getCell(noteRow, 1);
    noteCell.value = 'H1 = First Half (weeks 1-8), H2 = Second Half (weeks 9-16)';
    noteCell.font = { italic: true, size: 10 };
    noteCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF5F5F5' }
    };

    // Freeze first row and first column
    sheet.views = [
      {
        state: 'frozen',
        xSplit: 1,
        ySplit: 1
      }
    ];
  }

  // Create Legend sheet
  const legendSheet = workbook.addWorksheet('Legend');

  // Header
  legendSheet.getRow(1).values = ['Course Code', 'Course Name', 'Faculty', 'Sessions per week', 'Room Requirements', 'Color'];
  legendSheet.getRow(1).font = { bold: true };
  legendSheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  legendSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  // Get unique courses with room requirements
  const courseMap = new Map();
  for (const entry of entries) {
    const key = entry.course_code;
    if (!courseMap.has(key)) {
      courseMap.set(key, {
        course_code: entry.course_code,
        course_name: entry.course_name,
        faculty_id: entry.faculty_id,
        sessions: 0,
        room_requirements: entry.room_requirements || [],
        color: getColorForCourse(entry.course_code),
        totalDuration: 0
      });
    }
    courseMap.get(key).sessions += 1;
    courseMap.get(key).totalDuration += (entry.duration || 60);
  }

  // Fill legend rows
  let rowIdx = 2;
  for (const course of courseMap.values()) {
    const row = legendSheet.getRow(rowIdx);
    const roomReqStr = course.room_requirements.length > 0
      ? course.room_requirements.join(', ')
      : '-';
    const totalHours = (course.totalDuration / 60).toFixed(1);
    row.values = [course.course_code, course.course_name, course.faculty_id, `${course.sessions} (${totalHours}hr)`, roomReqStr, ''];

    // Add color indicator
    const colorCell = legendSheet.getCell(rowIdx, 6);
    colorCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${course.color}` }
    };

    rowIdx++;
  }

  // Set column widths for legend
  legendSheet.getColumn(1).width = 15;
  legendSheet.getColumn(2).width = 30;
  legendSheet.getColumn(3).width = 15;
  legendSheet.getColumn(4).width = 20;
  legendSheet.getColumn(5).width = 20;
  legendSheet.getColumn(6).width = 10;

  // Ensure output directory exists
  await fs.ensureDir(path.dirname(outputPath));

  // Write the file
  await workbook.xlsx.writeFile(outputPath);

  return outputPath;
}

module.exports = {
  exportTimetable
};

// Test code
if (require.main === module) {
  console.log('=== Export Timetable Test ===\n');

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

      console.log(`Generated ${timetable.length} entries`);

      // Show duration breakdown
      const durationCounts = { 60: 0, 90: 0 };
      for (const entry of timetable) {
        const d = entry.duration || 60;
        durationCounts[d] = (durationCounts[d] || 0) + 1;
      }
      console.log(`  60min slots: ${durationCounts[60]}`);
      console.log(`  90min slots: ${durationCounts[90]}`);

      const outputPath = path.join(__dirname, '..', 'outputs', 'Timetable.xlsx');
      console.log(`\nExporting to ${outputPath}...`);

      await exportTimetable(timetable, timeSlots, outputPath);

      console.log('✓ Excel file created successfully!');
      console.log(`  Location: ${outputPath}`);
    } catch (error) {
      console.error('Error:', error.message);
      console.error(error.stack);
    }
  })();
}
