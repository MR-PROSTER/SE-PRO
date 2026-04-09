/**
 * enrollmentResolver.js - Resolves actual student enrollment from students.csv
 *
 * Overrides course.students_enrolled with actual counts from students.csv
 * Provides enrollment discrepancy reporting
 */

/**
 * Resolve actual enrollments from students.csv data
 * @param {Array} courses - Array of course objects from dataLoader
 * @param {Map<string, Set<string>>} courseMap - Map<course_code, Set<Student_ID>> from loadStudents
 * @returns {Array} Updated courses array with resolved students_enrolled
 */
function resolveEnrollments(courses, courseMap) {
  let discrepancyCount = 0;
  const discrepancies = [];

  for (const course of courses) {
    const courseCode = course.course_code;
    const section = course.section;

    // Look up actual enrollment from courseMap
    // courseMap keys are course codes, we need to match by course_code
    const enrolledStudents = courseMap.get(courseCode);

    if (enrolledStudents) {
      const actualCount = enrolledStudents.size;
      const csvCount = course.students_enrolled || 0;

      // Update course with actual enrollment
      course.students_enrolled = actualCount;

      // Track discrepancies
      if (csvCount !== 0 && csvCount !== actualCount) {
        discrepancyCount++;
        discrepancies.push({
          course_code: courseCode,
          section,
          csv_enrollment: csvCount,
          actual_enrollment: actualCount,
          difference: actualCount - csvCount
        });
      }
    } else {
      // No students found for this course - use CSV count or 0
      if (!course.students_enrolled) {
        course.students_enrolled = 0;
      }
    }
  }

  console.log(
    `\nEnrollment Resolution: ${discrepancyCount} courses with enrollment discrepancies`
  );

  if (discrepancies.length > 0 && discrepancies.length <= 10) {
    console.log('Discrepancies (course_code: csv -> actual):');
    discrepancies.forEach(d => {
      const sign = d.difference > 0 ? '+' : '';
      console.log(
        `  ${d.course_code} (${d.section}): ${d.csv_enrollment} -> ${d.actual_enrollment} (${sign}${d.difference})`
      );
    });
  } else if (discrepancies.length > 10) {
    console.log(`  ${discrepancies.length} discrepancies total (showing first 10):`);
    discrepancies.slice(0, 10).forEach(d => {
      const sign = d.difference > 0 ? '+' : '';
      console.log(
        `  ${d.course_code} (${d.section}): ${d.csv_enrollment} -> ${d.actual_enrollment} (${sign}${d.difference})`
      );
    });
  }

  return { courses, discrepancies };
}

/**
 * Get enrollment statistics
 * @param {Array} courses - Array of course objects with resolved enrollment
 * @param {Map<string, Set<string>>} courseMap - Course to student mapping
 * @returns {Object} Enrollment statistics
 */
function getEnrollmentStats(courses, courseMap) {
  const stats = {
    totalCourses: courses.length,
    coursesWithEnrollment: 0,
    coursesWithoutEnrollment: 0,
    totalStudents: 0,
    averageEnrollment: 0,
    maxEnrollment: 0,
    minEnrollment: Infinity,
    coursesByEnrollmentRange: {
      '0': 0,
      '1-30': 0,
      '31-60': 0,
      '61-120': 0,
      '121+': 0
    }
  };

  let totalEnrollment = 0;

  for (const course of courses) {
    const enrollment = course.students_enrolled || 0;

    if (enrollment > 0) {
      stats.coursesWithEnrollment++;
      totalEnrollment += enrollment;

      if (enrollment > stats.maxEnrollment) {
        stats.maxEnrollment = enrollment;
      }
      if (enrollment < stats.minEnrollment) {
        stats.minEnrollment = enrollment;
      }

      // Categorize by enrollment range
      if (enrollment <= 30) {
        stats.coursesByEnrollmentRange['1-30']++;
      } else if (enrollment <= 60) {
        stats.coursesByEnrollmentRange['31-60']++;
      } else if (enrollment <= 120) {
        stats.coursesByEnrollmentRange['61-120']++;
      } else {
        stats.coursesByEnrollmentRange['121+']++;
      }
    } else {
      stats.coursesWithoutEnrollment++;
    }
  }

  stats.totalStudents = totalEnrollment;
  stats.averageEnrollment = stats.coursesWithEnrollment > 0
    ? Math.round(totalEnrollment / stats.coursesWithEnrollment)
    : 0;

  if (stats.minEnrollment === Infinity) {
    stats.minEnrollment = 0;
  }

  return stats;
}

/**
 * Generate enrollment report
 * @param {Array} courses - Array of course objects
 * @param {Array} discrepancies - Array of discrepancy objects
 * @returns {Object} Report data for export
 */
function generateEnrollmentReport(courses, discrepancies) {
  const report = {
    summary: {
      totalCourses: courses.length,
      coursesWithDiscrepancies: discrepancies.length,
      discrepancyRate: courses.length > 0
        ? ((discrepancies.length / courses.length) * 100).toFixed(1) + '%'
        : '0%'
    },
    discrepancies: discrepancies.map(d => ({
      ...d,
      discrepancy_percentage: d.csv_enrollment > 0
        ? Math.round(((d.actual_enrollment - d.csv_enrollment) / d.csv_enrollment) * 100)
        : 0
    })),
    coursesBySection: {}
  };

  // Group by section
  for (const course of courses) {
    const section = course.section;
    if (!report.coursesBySection[section]) {
      report.coursesBySection[section] = {
        totalCourses: 0,
        totalEnrollment: 0,
        averageEnrollment: 0
      };
    }
    report.coursesBySection[section].totalCourses++;
    report.coursesBySection[section].totalEnrollment += course.students_enrolled || 0;
  }

  // Calculate averages per section
  for (const section of Object.keys(report.coursesBySection)) {
    const sectionData = report.coursesBySection[section];
    sectionData.averageEnrollment = Math.round(
      sectionData.totalEnrollment / sectionData.totalCourses
    );
  }

  return report;
}

module.exports = {
  resolveEnrollments,
  getEnrollmentStats,
  generateEnrollmentReport
};

// Test code - runs only when executed directly
if (require.main === module) {
  console.log('=== EnrollmentResolver Tests ===\n');

  // Mock courseMap from students.csv
  const mockCourseMap = new Map([
    ['CS101', new Set(['S001', 'S002', 'S003', 'S004', 'S005'])],
    ['CS102', new Set(['S001', 'S002', 'S003'])],
    ['CS103', new Set(['S001', 'S002', 'S003', 'S004', 'S005', 'S006', 'S007', 'S008'])],
    ['CS104', new Set(['S001', 'S002'])]
  ]);

  // Mock courses from CSV
  const mockCourses = [
    { course_code: 'CS101', section: 'CSEA-I', students_enrolled: 5 },
    { course_code: 'CS102', section: 'CSEA-I', students_enrolled: 10 }, // Discrepancy: CSV says 10, actual is 3
    { course_code: 'CS103', section: 'CSEA-I', students_enrolled: 8 },
    { course_code: 'CS104', section: 'CSEA-I', students_enrolled: 0 }, // Discrepancy: CSV says 0, actual is 2
    { course_code: 'CS999', section: 'CSEA-I', students_enrolled: 15 } // No students in courseMap
  ];

  console.log('Before resolution:');
  mockCourses.forEach(c => {
    console.log(`  ${c.course_code}: ${c.students_enrolled} students`);
  });

  const { courses, discrepancies } = resolveEnrollments(mockCourses, mockCourseMap);

  console.log('\nAfter resolution:');
  courses.forEach(c => {
    console.log(`  ${c.course_code}: ${c.students_enrolled} students`);
  });

  console.log(`\nDiscrepancies found: ${discrepancies.length}`);
  discrepancies.forEach(d => {
    console.log(`  ${d.course_code}: CSV=${d.csv_enrollment}, Actual=${d.actual_enrollment}, Diff=${d.difference}`);
  });

  console.log('\nEnrollment Statistics:');
  const stats = getEnrollmentStats(courses, mockCourseMap);
  console.log(`  Total courses: ${stats.totalCourses}`);
  console.log(`  Courses with enrollment: ${stats.coursesWithEnrollment}`);
  console.log(`  Courses without enrollment: ${stats.coursesWithoutEnrollment}`);
  console.log(`  Total students: ${stats.totalStudents}`);
  console.log(`  Average enrollment: ${stats.averageEnrollment}`);
  console.log(`  Max enrollment: ${stats.maxEnrollment}`);
  console.log(`  Min enrollment: ${stats.minEnrollment}`);
  console.log(`  By range: ${JSON.stringify(stats.coursesByEnrollmentRange)}`);

  console.log('\nEnrollment Report:');
  const report = generateEnrollmentReport(courses, discrepancies);
  console.log(`  Summary: ${JSON.stringify(report.summary, null, 2)}`);

  console.log('\n=== All tests passed! ===');
}
