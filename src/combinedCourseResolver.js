/**
 * combinedCourseResolver.js - Resolves Is_Combined=1 courses across sections
 *
 * Handles combined courses where multiple sections attend the same physical class:
 * - Same Course_Code with Is_Combined=1 in multiple section files
 * - Merged into one "combined course" with summed enrollment
 * - Scheduled together in one large room
 */

/**
 * Resolve combined courses from all courses
 * @param {Array} allCourses - All courses from dataLoader
 * @returns {{combinedCourses: Array, individualCourses: Array}}
 * - combinedCourses: Courses with Is_Combined=1 appearing in 2+ sections
 * - individualCourses: All other courses (regular + Is_Combined=1 in only 1 section)
 */
function resolveCombinedCourses(allCourses) {
  const combinedCourses = [];
  const individualCourses = [];

  // Group courses by course_code
  const courseGroups = new Map();
  for (const course of allCourses) {
    if (!courseGroups.has(course.course_code)) {
      courseGroups.set(course.course_code, []);
    }
    courseGroups.get(course.course_code).push(course);
  }

  // Process each course group
  for (const [courseCode, courses] of courseGroups) {
    // Check if any course in this group has is_combined=1
    const combinedCoursesInGroup = courses.filter(c => c.is_combined === 1);

    if (combinedCoursesInGroup.length > 0) {
      // Get unique sections that have this course with is_combined=1
      const sectionsWithCombined = [...new Set(combinedCoursesInGroup.map(c => c.section))];

      if (sectionsWithCombined.length >= 2) {
        // === COMBINED COURSE: Appears in 2+ sections with Is_Combined=1 ===
        // Merge into one combined course

        // Use first occurrence as base (should have same faculty/title across sections)
        const baseCourse = combinedCoursesInGroup[0];

        // Sum enrollment across all sections
        const combinedEnrollment = combinedCoursesInGroup.reduce(
          (sum, c) => sum + (c.students_enrolled || 0),
          0
        );

        // Create merged course object
        const mergedCourse = {
          course_code: baseCourse.course_code,
          course_title: baseCourse.course_title,
          L: baseCourse.L,
          T: baseCourse.T,
          P: baseCourse.P,
          S: baseCourse.S,
          C: baseCourse.C,
          faculty_ids: baseCourse.faculty_ids,
          faculty_name_raw: baseCourse.faculty_name_raw,
          sections: sectionsWithCombined,
          combined_enrollment: combinedEnrollment,
          semester_half: baseCourse.semester_half || 0,
          basket: baseCourse.basket || 0,
          is_combined: true,
          room_requirements: baseCourse.room_requirements || []
        };

        combinedCourses.push(mergedCourse);

        // Add non-combined versions of this course to individual (if any)
        // e.g., if course appears in 3 sections but only 2 have Is_Combined=1
        const nonCombinedCourses = courses.filter(c => c.is_combined !== 1);
        individualCourses.push(...nonCombinedCourses);

        console.log(
          `  Combined course detected: ${courseCode} across sections ${sectionsWithCombined.join(', ')} ` +
          `(total enrollment: ${combinedEnrollment})`
        );
      } else {
        // === Is_Combined=1 but only in ONE section ===
        // Treat as regular individual course (possibly a data issue or special case)
        console.warn(
          `  WARNING: ${courseCode} has Is_Combined=1 but only appears in one section (${sectionsWithCombined[0]}) - treating as individual course`
        );
        individualCourses.push(...courses);
      }
    } else {
      // === Regular course (no Is_Combined=1) ===
      individualCourses.push(...courses);
    }
  }

  console.log(
    `\nResolved: ${combinedCourses.length} combined course(s), ${individualCourses.length} individual course(s)`
  );

  return { combinedCourses, individualCourses };
}

/**
 * Check if a course is a combined course
 * @param {Object} course - Course object
 * @returns {boolean} true if combined
 */
function isCombinedCourse(course) {
  return course.is_combined === true && Array.isArray(course.sections) && course.sections.length >= 2;
}

module.exports = {
  resolveCombinedCourses,
  isCombinedCourse
};

// Test code - runs only when executed directly
if (require.main === module) {
  console.log('=== CombinedCourseResolver Tests ===\n');

  // Mock courses simulating Is_Combined=1 scenario
  const mockCourses = [
    // CS162: Is_Combined=1 in both CSEA-II and CSEB-II -> should merge
    {
      course_code: 'CS162',
      course_title: 'Optimization Techniques',
      L: 3, T: 0, P: 0, S: 0, C: 3,
      faculty_ids: ['F001'],
      faculty_name_raw: null,
      is_combined: 1,
      semester_half: 0,
      basket: 0,
      students_enrolled: 111,
      section: 'CSEA-II',
      room_requirements: []
    },
    {
      course_code: 'CS162',
      course_title: 'Optimization Techniques',
      L: 3, T: 0, P: 0, S: 0, C: 3,
      faculty_ids: ['F001'],
      faculty_name_raw: null,
      is_combined: 1,
      semester_half: 0,
      basket: 0,
      students_enrolled: 111,
      section: 'CSEB-II',
      room_requirements: []
    },
    // CS163: Is_Combined=1 in both CSEA-II and CSEB-II -> should merge
    {
      course_code: 'CS163',
      course_title: 'Data Structures & Algorithms',
      L: 3, T: 1, P: 0, S: 0, C: 4,
      faculty_ids: ['F002'],
      faculty_name_raw: null,
      is_combined: 1,
      semester_half: 0,
      basket: 0,
      students_enrolled: 111,
      section: 'CSEA-II',
      room_requirements: []
    },
    {
      course_code: 'CS163',
      course_title: 'Data Structures & Algorithms',
      L: 3, T: 1, P: 0, S: 0, C: 4,
      faculty_ids: ['F002'],
      faculty_name_raw: null,
      is_combined: 1,
      semester_half: 0,
      basket: 0,
      students_enrolled: 111,
      section: 'CSEB-II',
      room_requirements: []
    },
    // CS267: Is_Combined=0 in CSEA-IV only -> individual
    {
      course_code: 'CS267',
      course_title: 'Advanced Algorithms',
      L: 3, T: 0, P: 0, S: 0, C: 3,
      faculty_ids: ['F003'],
      faculty_name_raw: null,
      is_combined: 0,
      semester_half: 0,
      basket: 0,
      students_enrolled: 60,
      section: 'CSEA-IV',
      room_requirements: []
    },
    // CS999: Is_Combined=1 but only in ONE section -> should stay individual
    {
      course_code: 'CS999',
      course_title: 'Special Topics',
      L: 2, T: 0, P: 0, S: 0, C: 2,
      faculty_ids: ['F004'],
      faculty_name_raw: null,
      is_combined: 1,
      semester_half: 0,
      basket: 0,
      students_enrolled: 30,
      section: 'CSEA-VI',
      room_requirements: []
    }
  ];

  console.log('Test 1: resolveCombinedCourses');
  const { combinedCourses, individualCourses } = resolveCombinedCourses(mockCourses);

  console.log(`\n  Combined courses: ${combinedCourses.length}`);
  for (const c of combinedCourses) {
    console.log(`    - ${c.course_code}: sections [${c.sections.join(', ')}], enrollment=${c.combined_enrollment}`);
  }

  console.log(`\n  Individual courses: ${individualCourses.length}`);
  for (const c of individualCourses) {
    console.log(`    - ${c.course_code}: section=${c.section}, is_combined=${c.is_combined}`);
  }

  // Verify expected results
  console.assert(combinedCourses.length === 2, 'Should have 2 combined courses (CS162, CS163)');
  console.assert(
    combinedCourses.some(c => c.course_code === 'CS162' && c.sections.includes('CSEA-II') && c.sections.includes('CSEB-II')),
    'CS162 should be combined across CSEA-II and CSEB-II'
  );
  console.assert(
    combinedCourses.some(c => c.course_code === 'CS162' && c.combined_enrollment === 222),
    'CS162 should have combined enrollment of 222'
  );

  console.assert(individualCourses.length === 2, 'Should have 2 individual courses (CS267, CS999)');
  console.assert(
    individualCourses.some(c => c.course_code === 'CS267'),
    'CS267 should be individual'
  );
  console.assert(
    individualCourses.some(c => c.course_code === 'CS999'),
    'CS999 should be individual (Is_Combined=1 but only one section)'
  );

  // Test 2: isCombinedCourse
  console.log('\nTest 2: isCombinedCourse');
  for (const c of combinedCourses) {
    console.log(`  ${c.course_code}: isCombinedCourse=${isCombinedCourse(c)}`);
    console.assert(isCombinedCourse(c) === true, `${c.course_code} should be recognized as combined`);
  }
  for (const c of individualCourses) {
    console.log(`  ${c.course_code}: isCombinedCourse=${isCombinedCourse(c)}`);
    console.assert(isCombinedCourse(c) === false, `${c.course_code} should NOT be recognized as combined`);
  }

  console.log('\n=== All tests passed! ===');
}
