# Shared Results Module API Specification

## Overview
This document defines the architecture, file structure, and API for sharing beautiful Test Results UI components between Single User Test and Virtual Household Test modes.

## File Structure

```
client/
├── shared/
│   ├── testResults.js              # Main shared results module
│   ├── resultAdapters.js           # Data transformation adapters
│   ├── celebrationEffects.js      # Confetti, sparkles, animations
│   ├── interactiveTooltips.js     # Hover tooltips system
│   ├── shareSystem.js             # PNG generation and sharing
│   └── gradeCalculations.js       # Shared grading logic
├── results.js                     # Modified Single User results
├── share.js                       # Legacy share (to be deprecated)
└── virtualHousehold/
    └── uiHousehold.js             # Modified Virtual Household UI
```

## Core Data Interfaces

### 1. Unified Result Format
```typescript
interface UnifiedResultData {
  // Core grade information
  totalGrade: {
    grade: string;           // 'A+', 'A', 'B', 'C', 'D', 'F'
    cssClass: string;        // 'a-plus', 'a', 'b', 'c', 'd', 'f'
    description: string;     // Human-readable description
    showApproved: boolean;   // Show approved.png badge
  };
  
  // Individual phase/metric grades
  phases: PhaseGrade[];
  
  // Statistical data for tables
  statistics: {
    latency?: LatencyStats[];
    throughput?: ThroughputStats[];
    custom?: CustomStats[];
  };
  
  // Test metadata
  metadata: {
    testType: 'single-user' | 'virtual-household';
    timestamp: Date;
    shareTitle: string;
    explanationContent?: string;
  };
  
  // Optional additional data
  recommendations?: string[];
  userResults?: UserResult[];  // For Virtual Household
}

interface PhaseGrade {
  id: string;              // 'download', 'upload', 'bidirectional', 'fairness', 'stability'
  name: string;            // 'Download', 'Upload', 'Bidirectional', 'Network Fairness'
  grade: string;           // 'A+', 'A', 'B', 'C', 'D', 'F'
  cssClass: string;        // 'a-plus', 'a', 'b', 'c', 'd', 'f'
  metric: string;          // '+2.1ms', '95%', 'Excellent'
  tooltip: TooltipContent;
  showInShareImage: boolean;
}

interface TooltipContent {
  header: string;          // 'Download Grade: A+'
  content: string;         // 'Latency increased by 2.1ms under load — minimal bufferbloat!'
}
```

### 2. Statistics Interfaces
```typescript
interface LatencyStats {
  phase: string;           // 'Baseline', 'Download', 'Upload', 'Bidirectional'
  median: number;
  average: number;
  p25: number;
  p75: number;
  p95: number;
}

interface ThroughputStats {
  phase: string;           // 'Download', 'Upload', 'Bidi Download', 'Bidi Upload'
  median: number;
  average: number;
  p75: number;
}

interface CustomStats {
  label: string;
  value: string;
  description?: string;
}
```

## API Specification

### 1. Main Results Module (`client/shared/testResults.js`)

```javascript
/**
 * Main entry point for displaying unified test results
 * @param {UnifiedResultData} data - Unified result data
 * @param {string} containerId - DOM container ID
 * @param {DisplayOptions} options - Display configuration
 */
export function displayUnifiedResults(data, containerId, options = {})

/**
 * Display configuration options
 */
interface DisplayOptions {
  showStatistics: boolean;      // Default: true
  showExplanation: boolean;     // Default: true
  showShareButton: boolean;     // Default: true
  enableCelebrations: boolean;  // Default: true
  enableTooltips: boolean;      // Default: true
  customCSS?: string;          // Additional CSS classes
}

/**
 * Initialize all interactive features
 * @param {string} containerId - Container ID
 * @param {UnifiedResultData} data - Result data for interactions
 */
export function initializeInteractiveFeatures(containerId, data)

/**
 * Clean up event listeners and animations
 * @param {string} containerId - Container ID
 */
export function cleanupResults(containerId)
```

### 2. Result Adapters (`client/shared/resultAdapters.js`)

```javascript
/**
 * Create adapter for Single User Test data
 * @returns {SingleUserAdapter}
 */
export function createSingleUserAdapter()

/**
 * Create adapter for Virtual Household Test data
 * @returns {VirtualHouseholdAdapter}
 */
export function createVirtualHouseholdAdapter()

class SingleUserAdapter {
  /**
   * Transform Single User test data to unified format
   * @param {Object} singleUserData - Original Single User test data
   * @returns {UnifiedResultData}
   */
  transform(singleUserData) {
    return {
      totalGrade: {
        grade: singleUserData.totalGrade.grade,
        cssClass: singleUserData.totalGrade.cssClass,
        description: this.generateTotalGradeDescription(singleUserData.totalGrade.grade),
        showApproved: ['A+', 'A'].includes(singleUserData.totalGrade.grade)
      },
      phases: [
        {
          id: 'download',
          name: 'Download',
          grade: singleUserData.downloadGrade.grade,
          cssClass: singleUserData.downloadGrade.cssClass,
          metric: `+${singleUserData.downloadLatencyIncrease.toFixed(1)}ms`,
          tooltip: {
            header: `Download Grade: ${singleUserData.downloadGrade.grade}`,
            content: `Latency increased by ${singleUserData.downloadLatencyIncrease.toFixed(1)}ms under load — ${this.getPerformanceDescription(singleUserData.downloadGrade.grade)}`
          },
          showInShareImage: true
        },
        // ... upload and bidirectional phases
      ],
      statistics: {
        latency: this.transformLatencyStats(singleUserData),
        throughput: this.transformThroughputStats(singleUserData)
      },
      metadata: {
        testType: 'single-user',
        timestamp: new Date(),
        shareTitle: 'My Bufferbloat Test Results',
        explanationContent: this.getSingleUserExplanation()
      }
    };
  }
}

class VirtualHouseholdAdapter {
  /**
   * Transform Virtual Household test data to unified format
   * @param {Object} householdData - Original Virtual Household test data
   * @returns {UnifiedResultData}
   */
  transform(householdData) {
    return {
      totalGrade: {
        grade: householdData.overall.overallGrade,
        cssClass: this.gradeToClass(householdData.overall.overallGrade),
        description: this.generateHouseholdGradeDescription(householdData.overall.overallGrade),
        showApproved: ['A+', 'A'].includes(householdData.overall.overallGrade)
      },
      phases: [
        {
          id: 'fairness',
          name: 'Network Fairness',
          grade: householdData.overall.fairness,
          cssClass: this.gradeToClass(householdData.overall.fairness),
          metric: this.convertGradeToPercent(householdData.overall.fairness) + '%',
          tooltip: {
            header: `Network Fairness: ${householdData.overall.fairness}`,
            content: `How fairly bandwidth is distributed among household users — ${this.getFairnessDescription(householdData.overall.fairness)}`
          },
          showInShareImage: true
        },
        {
          id: 'stability',
          name: 'Latency Stability',
          grade: householdData.overall.stability,
          cssClass: this.gradeToClass(householdData.overall.stability),
          metric: this.convertGradeToPercent(householdData.overall.stability) + '%',
          tooltip: {
            header: `Latency Stability: ${householdData.overall.stability}`,
            content: `How consistent latency remains under household load — ${this.getStabilityDescription(householdData.overall.stability)}`
          },
          showInShareImage: true
        }
      ],
      statistics: {
        custom: this.transformHouseholdStats(householdData)
      },
      metadata: {
        testType: 'virtual-household',
        timestamp: new Date(),
        shareTitle: 'My Virtual Household Test Results',
        explanationContent: this.getHouseholdExplanation()
      },
      userResults: this.transformUserResults(householdData.users),
      recommendations: householdData.recommendations
    };
  }
}
```

### 3. Celebration Effects (`client/shared/celebrationEffects.js`)

```javascript
/**
 * Initialize celebration effects for excellent grades
 * @param {UnifiedResultData} data - Result data
 * @param {string} containerId - Container ID
 */
export function initializeCelebrationEffects(data, containerId)

/**
 * Trigger celebration for total grade
 * @param {HTMLElement} totalGradeElement - Total grade DOM element
 * @param {string} grade - Grade letter
 */
export function triggerTotalGradeCelebration(totalGradeElement, grade)

/**
 * Trigger celebration for individual phases
 * @param {HTMLElement} phaseElement - Phase grade DOM element
 * @param {string} grade - Grade letter
 */
export function triggerPhaseCelebration(phaseElement, grade)

/**
 * Create confetti effect
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Confetti configuration
 */
export function createConfettiEffect(container, options = {})

/**
 * Create sparkle effect for A+ grades
 * @param {HTMLElement} container - Container element
 */
export function createSparkleEffect(container)

/**
 * Clean up all celebration effects
 * @param {string} containerId - Container ID
 */
export function cleanupCelebrationEffects(containerId)
```

### 4. Interactive Tooltips (`client/shared/interactiveTooltips.js`)

```javascript
/**
 * Initialize tooltip system for all grade elements
 * @param {UnifiedResultData} data - Result data with tooltip content
 * @param {string} containerId - Container ID
 */
export function initializeTooltipSystem(data, containerId)

/**
 * Add tooltip to specific element
 * @param {HTMLElement} element - Target element
 * @param {TooltipContent} content - Tooltip content
 */
export function addTooltip(element, content)

/**
 * Position tooltip relative to target
 * @param {HTMLElement} tooltip - Tooltip element
 * @param {HTMLElement} target - Target element
 * @param {number} mouseX - Mouse X coordinate
 * @param {number} mouseY - Mouse Y coordinate
 */
export function positionTooltip(tooltip, target, mouseX, mouseY)

/**
 * Clean up tooltip system
 * @param {string} containerId - Container ID
 */
export function cleanupTooltips(containerId)
```

### 5. Share System (`client/shared/shareSystem.js`)

```javascript
/**
 * Initialize share functionality
 * @param {UnifiedResultData} data - Result data for sharing
 * @param {string} containerId - Container ID
 */
export function initializeShareSystem(data, containerId)

/**
 * Generate shareable PNG image
 * @param {UnifiedResultData} data - Result data
 * @returns {Promise<Blob>} PNG image blob
 */
export async function generateShareablePNG(data)

/**
 * Create shareable content container
 * @param {UnifiedResultData} data - Result data
 * @returns {HTMLElement} Shareable content container
 */
export function createShareableContent(data)

/**
 * Download PNG image
 * @param {Blob} blob - PNG image blob
 * @param {string} filename - Download filename
 */
export function downloadPNG(blob, filename)
```

## Integration Examples

### 1. Single User Test Integration

```javascript
// In client/results.js
import { 
  displayUnifiedResults, 
  createSingleUserAdapter 
} from './shared/testResults.js';

function analyzeAndDisplayResults(testData) {
  // Existing analysis logic...
  const downloadGrade = determineGrade(downloadLatencyIncrease);
  const uploadGrade = determineGrade(uploadLatencyIncrease);
  const bidirectionalGrade = determineGrade(bidirectionalLatencyIncrease);
  const totalGrade = calculateTotalGrade(downloadGrade, uploadGrade, bidirectionalGrade);
  
  // Transform to unified format
  const adapter = createSingleUserAdapter();
  const unifiedData = adapter.transform({
    downloadGrade,
    uploadGrade,
    bidirectionalGrade,
    totalGrade,
    downloadLatencyIncrease,
    uploadLatencyIncrease,
    bidirectionalLatencyIncrease,
    baselineStats,
    downloadStats,
    uploadStats,
    bidirectionalStats,
    downloadThroughputStats,
    uploadThroughputStats,
    bidiDownloadThroughputStats,
    bidiUploadThroughputStats
  });
  
  // Display using shared system
  displayUnifiedResults(unifiedData, 'results', {
    showStatistics: true,
    showExplanation: true,
    showShareButton: true,
    enableCelebrations: true,
    enableTooltips: true
  });
}
```

### 2. Virtual Household Test Integration

```javascript
// In client/virtualHousehold/uiHousehold.js
import { 
  displayUnifiedResults, 
  createVirtualHouseholdAdapter 
} from '../shared/testResults.js';

displayResults(results) {
  if (!this.elements.resultsContainer) return;
  
  console.log('🏠 Showing results:', results);
  
  // Transform to unified format
  const adapter = createVirtualHouseholdAdapter();
  const unifiedData = adapter.transform(results);
  
  // Display using shared system
  displayUnifiedResults(unifiedData, 'householdResults', {
    showStatistics: true,
    showExplanation: true,
    showShareButton: true,
    enableCelebrations: true,
    enableTooltips: true
  });
  
  // Show results container
  this.elements.resultsContainer.style.display = 'block';
  
  // Scroll to results
  this.elements.resultsContainer.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}
```

## HTML Structure Requirements

### 1. Single User Test Container
```html
<div id="results" class="results-container hidden">
  <!-- Shared results module will populate this -->
</div>
```

### 2. Virtual Household Test Container
```html
<div id="householdResults" class="results-container" style="display: none;">
  <!-- Shared results module will populate this -->
</div>
```

## CSS Requirements

### 1. Shared Styles
The shared module will include all necessary CSS for:
- Grade cards and styling
- Celebration animations
- Tooltip styling
- Share button styling
- Statistics table formatting

### 2. Test-Specific Overrides
Each test mode can provide additional CSS for:
- Container-specific styling
- Custom color schemes
- Layout adjustments

## Migration Strategy

### Phase 1: Create Shared Module
1. Create all shared module files
2. Implement core functionality
3. Create comprehensive tests

### Phase 2: Migrate Single User Test
1. Modify `client/results.js` to use shared module
2. Test all existing functionality
3. Ensure backward compatibility

### Phase 3: Migrate Virtual Household Test
1. Modify `client/virtualHousehold/uiHousehold.js`
2. Implement household-specific features
3. Test all new functionality

### Phase 4: Cleanup
1. Remove deprecated code
2. Update documentation
3. Optimize performance

## Benefits Summary

1. **Unified Beautiful UI** - Both test modes get identical styling and effects
2. **Maintainability** - Single source of truth for UI components
3. **Extensibility** - Easy to add new test modes or features
4. **Consistency** - Identical user experience across test modes
5. **Enhanced Features** - Virtual Household gets celebrations, tooltips, sharing
6. **Backward Compatibility** - No breaking changes to existing functionality

## Dependencies

- **html2canvas** - For PNG generation (already included)
- **Existing CSS** - Grade styling, animations (will be extracted)
- **DOM APIs** - Event handling, element manipulation
- **ES6 Modules** - Import/export functionality

This specification provides a complete blueprint for implementing the shared results module system while maintaining all existing functionality and adding beautiful UI components to Virtual Household Test mode.