/**
 * Shared Grade Calculations Module
 * Contains all grading logic, thresholds, and CSS class mappings
 * Used by both Single User Test and Virtual Household Test
 */

// Constants for grading thresholds (extracted from client/results.js)
export const GRADE_THRESHOLDS = [
    { threshold: 5, grade: 'A+', class: 'a-plus' },
    { threshold: 30, grade: 'A', class: 'a' },
    { threshold: 60, grade: 'B', class: 'b' },
    { threshold: 200, grade: 'C', class: 'c' },
    { threshold: 400, grade: 'D', class: 'd' },
    { threshold: Infinity, grade: 'F', class: 'f' }
];

// Constants for Total Grade calculation
export const GRADE_TO_NUMERIC = {
    'A+': 6,
    'A': 5,
    'B': 4,
    'C': 3,
    'D': 2,
    'F': 1
};

export const NUMERIC_TO_GRADE_THRESHOLDS = [
    { threshold: 5.5, grade: 'A+', class: 'a-plus' },
    { threshold: 4.5, grade: 'A', class: 'a' },
    { threshold: 3.5, grade: 'B', class: 'b' },
    { threshold: 2.5, grade: 'C', class: 'c' },
    { threshold: 1.5, grade: 'D', class: 'd' },
    { threshold: 0, grade: 'F', class: 'f' }
];

/**
 * Determine the bufferbloat grade based on latency increase
 * @param {number} latencyIncrease - The increase in latency under load (ms)
 * @returns {Object} Object containing grade and CSS class
 */
export function determineGrade(latencyIncrease) {
    for (const { threshold, grade, class: cssClass } of GRADE_THRESHOLDS) {
        if (latencyIncrease < threshold) {
            return { grade, cssClass };
        }
    }
    
    // Default to F if no threshold matches (shouldn't happen due to Infinity threshold)
    return { grade: 'F', cssClass: 'f' };
}

/**
 * Convert a numeric grade value back to a letter grade
 * @param {number} numericValue - The numeric grade value (1-6)
 * @returns {Object} Object containing grade and CSS class
 */
export function convertNumericToGrade(numericValue) {
    for (const { threshold, grade, class: cssClass } of NUMERIC_TO_GRADE_THRESHOLDS) {
        if (numericValue >= threshold) {
            return { grade, cssClass };
        }
    }
    
    // Default to F if no threshold matches
    return { grade: 'F', cssClass: 'f' };
}

/**
 * Calculate the Total Grade from individual phase grades using equal weighting
 * @param {Object} downloadGrade - Download grade info
 * @param {Object} uploadGrade - Upload grade info
 * @param {Object} bidirectionalGrade - Bidirectional grade info
 * @returns {Object} Object containing total grade and CSS class
 */
export function calculateTotalGrade(downloadGrade, uploadGrade, bidirectionalGrade) {
    // Convert grades to numeric values
    const dlNumeric = GRADE_TO_NUMERIC[downloadGrade.grade];
    const ulNumeric = GRADE_TO_NUMERIC[uploadGrade.grade];
    const bidiNumeric = GRADE_TO_NUMERIC[bidirectionalGrade.grade];
    
    // Calculate weighted average with equal weights (33.33% each)
    const totalNumeric = (dlNumeric + ulNumeric + bidiNumeric) / 3;
    
    // Convert back to letter grade
    return convertNumericToGrade(totalNumeric);
}

/**
 * Calculate the Total Grade from latency increases (Single User Mode)
 * @param {number} downloadLatencyIncrease - Download latency increase in ms
 * @param {number} uploadLatencyIncrease - Upload latency increase in ms
 * @param {number} bidirectionalLatencyIncrease - Bidirectional latency increase in ms
 * @returns {Object} Object containing total grade and CSS class
 */
export function calculateTotalGradeFromLatency(downloadLatencyIncrease, uploadLatencyIncrease, bidirectionalLatencyIncrease) {
    // Calculate average latency increase across all three phases
    const averageLatencyIncrease = (downloadLatencyIncrease + uploadLatencyIncrease + bidirectionalLatencyIncrease) / 3;
    
    // Use the standard latency increase to grade conversion
    return determineGrade(averageLatencyIncrease);
}

/**
 * Convert letter grade to CSS class name
 * @param {string} grade - Letter grade (A+, A, B, C, D, F)
 * @returns {string} CSS class name
 */
export function gradeToClass(grade) {
    const gradeMap = {
        'A+': 'a-plus',
        'A': 'a',
        'B': 'b',
        'C': 'c',
        'D': 'd',
        'F': 'f'
    };
    return gradeMap[grade] || 'f';
}

/**
 * Convert letter grade to approximate percentage for display
 * @param {string} grade - Letter grade (A+, A, B, C, D, F)
 * @returns {number} Percentage value
 */
export function convertGradeToPercent(grade) {
    const gradeMap = {
        'A+': 98,
        'A': 95,
        'B': 85,
        'C': 75,
        'D': 65,
        'F': 50
    };
    return gradeMap[grade] || 0;
}

/**
 * Check if a grade qualifies for celebration effects
 * @param {string} grade - Letter grade
 * @returns {boolean} True if grade should trigger celebrations
 */
export function shouldCelebrate(grade) {
    return ['A+', 'A'].includes(grade);
}

/**
 * Get performance description for a grade
 * @param {string} grade - Letter grade
 * @returns {string} Human-readable performance description
 */
export function getPerformanceDescription(grade) {
    switch (grade) {
        case 'A+':
            return 'virtually no bufferbloat — excellent performance!';
        case 'A':
            return 'minimal bufferbloat — very good performance!';
        case 'B':
            return 'moderate bufferbloat — good performance.';
        case 'C':
            return 'noticeable bufferbloat — fair performance.';
        case 'D':
            return 'significant bufferbloat — poor performance.';
        case 'F':
            return 'severe bufferbloat — very poor performance.';
        default:
            return 'performance measured.';
    }
}