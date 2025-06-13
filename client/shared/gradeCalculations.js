/**
 * Shared Grade Calculations Module
 * Contains all grading logic, thresholds, and CSS class mappings
 * Used by both Single User Test and Virtual Household Test
 * Now loads thresholds from configurable JSON file
 */

// Global variables to hold loaded thresholds
let BASELINE_THRESHOLDS = [];
let INCREASE_THRESHOLDS = [];
let thresholdsLoaded = false;

// Fallback thresholds in case config file fails to load
const FALLBACK_BASELINE_THRESHOLDS = [
    { threshold: 75, grade: 'A+', class: 'a-plus' },
    { threshold: 100, grade: 'A', class: 'a' },
    { threshold: 125, grade: 'B', class: 'b' },
    { threshold: 150, grade: 'C', class: 'c' },
    { threshold: 175, grade: 'D', class: 'd' },
    { threshold: Infinity, grade: 'F', class: 'f' }
];

const FALLBACK_INCREASE_THRESHOLDS = [
    { threshold: 5, grade: 'A+', class: 'a-plus' },
    { threshold: 30, grade: 'A', class: 'a' },
    { threshold: 60, grade: 'B', class: 'b' },
    { threshold: 200, grade: 'C', class: 'c' },
    { threshold: 400, grade: 'D', class: 'd' },
    { threshold: Infinity, grade: 'F', class: 'f' }
];

/**
 * Load grading thresholds from configuration file
 */
async function loadGradingThresholds() {
    if (thresholdsLoaded) return;
    
    try {
        const response = await fetch('/latencyGradeThresholds.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const config = await response.json();
        
        // Load baseline thresholds
        if (config.baseline && config.baseline.thresholds) {
            BASELINE_THRESHOLDS = config.baseline.thresholds.map(t => ({
                threshold: t.threshold,
                grade: t.grade,
                class: t.class,
                description: t.description
            }));
        } else {
            throw new Error('Invalid baseline thresholds in config');
        }
        
        // Load increase thresholds
        if (config.increase && config.increase.thresholds) {
            INCREASE_THRESHOLDS = config.increase.thresholds.map(t => ({
                threshold: t.threshold,
                grade: t.grade,
                class: t.class,
                description: t.description
            }));
        } else {
            throw new Error('Invalid increase thresholds in config');
        }
        
        thresholdsLoaded = true;
        console.log('✅ Grading thresholds loaded from configuration file');
        console.log(`📊 Baseline thresholds: ${BASELINE_THRESHOLDS.length} levels`);
        console.log(`📊 Increase thresholds: ${INCREASE_THRESHOLDS.length} levels`);
        
    } catch (error) {
        console.warn('⚠️ Failed to load grading thresholds from config file:', error.message);
        console.log('📊 Using fallback threshold values');
        
        // Use fallback values
        BASELINE_THRESHOLDS = [...FALLBACK_BASELINE_THRESHOLDS];
        INCREASE_THRESHOLDS = [...FALLBACK_INCREASE_THRESHOLDS];
        thresholdsLoaded = true;
    }
}

/**
 * Get current baseline thresholds (loads config if needed)
 */
async function getBaselineThresholds() {
    if (!thresholdsLoaded) {
        await loadGradingThresholds();
    }
    return BASELINE_THRESHOLDS;
}

/**
 * Get current increase thresholds (loads config if needed)
 */
async function getIncreaseThresholds() {
    if (!thresholdsLoaded) {
        await loadGradingThresholds();
    }
    return INCREASE_THRESHOLDS;
}

// Legacy export for backward compatibility (uses baseline thresholds)
export async function getGradeThresholds() {
    return await getBaselineThresholds();
}

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
 * Determine the baseline latency grade using baseline thresholds
 * @param {number} baselineLatency - The baseline latency in ms
 * @returns {Promise<Object>} Object containing grade and CSS class
 */
export async function determineBaselineGrade(baselineLatency) {
    const thresholds = await getBaselineThresholds();
    
    for (const { threshold, grade, class: cssClass } of thresholds) {
        if (baselineLatency < threshold) {
            return { grade, cssClass };
        }
    }
    
    // Default to F if no threshold matches (shouldn't happen due to Infinity threshold)
    return { grade: 'F', cssClass: 'f' };
}

/**
 * Determine the bufferbloat grade based on latency increase under load
 * Uses separate increase thresholds optimized for bufferbloat detection
 * @param {number} latencyIncrease - The increase in latency under load (ms)
 * @returns {Promise<Object>} Object containing grade and CSS class
 */
export async function determineGrade(latencyIncrease) {
    const thresholds = await getIncreaseThresholds();
    
    for (const { threshold, grade, class: cssClass } of thresholds) {
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
 * Calculate the Total Grade using new min(baseline, average_bloat) formula
 * @param {Object} baselineGrade - Baseline latency grade info
 * @param {Object} downloadGrade - Download bloat grade info
 * @param {Object} uploadGrade - Upload bloat grade info
 * @param {Object} bidirectionalGrade - Bidirectional bloat grade info
 * @returns {Object} Object containing total grade and CSS class
 */
export function calculateTotalGrade(baselineGrade, downloadGrade, uploadGrade, bidirectionalGrade) {
    // Convert grades to numeric values
    const baselineNumeric = GRADE_TO_NUMERIC[baselineGrade.grade];
    const dlNumeric = GRADE_TO_NUMERIC[downloadGrade.grade];
    const ulNumeric = GRADE_TO_NUMERIC[uploadGrade.grade];
    const bidiNumeric = GRADE_TO_NUMERIC[bidirectionalGrade.grade];
    
    // Calculate average of the three bloat grades
    const averageBloatNumeric = (dlNumeric + ulNumeric + bidiNumeric) / 3;
    
    // Total grade is minimum of baseline and average bloat
    const totalNumeric = Math.min(baselineNumeric, averageBloatNumeric);
    
    // Convert back to letter grade
    return convertNumericToGrade(totalNumeric);
}

/**
 * Calculate the Total Grade from latency values using new min(baseline, average_bloat) formula
 * @param {number} baselineLatency - Baseline latency in ms
 * @param {number} downloadLatencyIncrease - Download latency increase in ms
 * @param {number} uploadLatencyIncrease - Upload latency increase in ms
 * @param {number} bidirectionalLatencyIncrease - Bidirectional latency increase in ms
 * @returns {Promise<Object>} Object containing total grade and CSS class
 */
export async function calculateTotalGradeFromLatency(baselineLatency, downloadLatencyIncrease, uploadLatencyIncrease, bidirectionalLatencyIncrease) {
    // Calculate grades for each component using appropriate thresholds
    const baselineGrade = await determineBaselineGrade(baselineLatency);
    const downloadGrade = await determineGrade(downloadLatencyIncrease);
    const uploadGrade = await determineGrade(uploadLatencyIncrease);
    const bidirectionalGrade = await determineGrade(bidirectionalLatencyIncrease);
    
    // Use the main calculateTotalGrade function
    return calculateTotalGrade(baselineGrade, downloadGrade, uploadGrade, bidirectionalGrade);
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