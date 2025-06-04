# Adaptive Virtual Household Test Implementation Plan

## Overview
Two-phase Virtual Household test that automatically adapts to the user's actual connection speed for realistic household simulation.

## Phase 1: Download Warmup (10 seconds)
**Goal**: Measure actual connection capacity and calculate 95th percentile speed

### Implementation Strategy
- **Method**: Simple dedicated bulk download warmup
- **Duration**: 10 seconds
- **Sampling**: Every 250ms (40 total samples)
- **Calculation**: 95th percentile of throughput measurements
- **Retry Logic**: One retry attempt if warmup fails
- **Fallback**: 200 Mbps if both attempts fail

### Technical Components

#### 1. Warmup Controller (`client/virtualHousehold/warmupController.js`)
```javascript
class ConnectionWarmup {
    constructor() {
        this.samples = [];
        this.sampleInterval = 250; // ms
        this.duration = 10000; // 10 seconds
        this.maxRetries = 1;
    }
    
    async measureConnection() {
        // Bulk download with throughput sampling
        // Calculate 95th percentile from samples
        // Return { success, speed95th, maxSpeed, samples }
    }
}
```

#### 2. Server Warmup Endpoint (`server/endpoints/warmup.py`)
```python
@router.get("/warmup/bulk-download")
async def warmup_bulk_download():
    # Stream bulk data for warmup measurement
    # Optimized for pure throughput testing
```

#### 3. Throughput Calculator
```javascript
function calculate95thPercentile(samples) {
    const sorted = samples.sort((a, b) => a - b);
    const index = Math.ceil(0.95 * sorted.length) - 1;
    return sorted[index];
}
```

## Phase 2: Adaptive Virtual Household (30 seconds)
**Goal**: Run realistic household simulation scaled to actual connection capacity

### Scaling Strategy
All user profiles scale proportionally to measured connection capacity:

#### Base Profile Ratios (Current)
- **Alex (Gaming)**: 1.5 Mbps → 0.75% of connection
- **Sarah (Video)**: 2.5 Mbps → 1.25% of connection  
- **Jake (Netflix)**: 25 Mbps → 12.5% of connection
- **Computer (Updates)**: 95th percentile → Variable% of connection

#### Adaptive Scaling Formula
```javascript
function scaleUserProfiles(measured95thPercentile) {
    const baseTotal = 29.0; // 1.5 + 2.5 + 25.0 Mbps
    const scaleFactor = measured95thPercentile / 200.0; // Scale from 200 Mbps baseline
    
    return {
        alex: Math.max(1.0, 1.5 * scaleFactor),
        sarah: Math.max(1.5, 2.5 * scaleFactor),
        jake: Math.max(5.0, 25.0 * scaleFactor),
        computer: measured95thPercentile
    };
}
```

### Burst Pattern Adaptation
- **Computer**: Uses 95th percentile as maximum with current constant pattern
- **Jake (Netflix)**: Scales burst/pause rates proportionally
- **Alex/Sarah**: Scale but maintain minimum viable speeds

## Implementation Architecture

### 1. UI Flow Enhancement

#### Virtual Household Page Updates
```html
<!-- Phase indicator -->
<div class="test-phase-indicator">
    <div class="phase active" id="phase-warmup">
        <span class="phase-number">1</span>
        <span class="phase-name">Connection Warmup</span>
        <span class="phase-duration">10s</span>
    </div>
    <div class="phase" id="phase-household">
        <span class="phase-number">2</span>
        <span class="phase-name">Household Simulation</span>
        <span class="phase-duration">30s</span>
    </div>
</div>

<!-- Warmup results display -->
<div class="warmup-results" id="warmup-results" style="display: none;">
    <h3>Connection Analysis Complete</h3>
    <div class="speed-measurement">
        <span class="speed-value" id="measured-speed">0</span>
        <span class="speed-unit">Mbps</span>
        <span class="speed-label">(95th percentile)</span>
    </div>
    <div class="scaled-profiles" id="scaled-profiles">
        <!-- Show how each user will be scaled -->
    </div>
    <button id="start-household-test">Start Household Test</button>
</div>
```

### 2. State Management

#### Warmup State Controller
```javascript
class AdaptiveVirtualHousehold {
    constructor() {
        this.state = 'idle'; // idle, warmup, results, household, complete
        this.warmupResults = null;
        this.scaledProfiles = null;
    }
    
    async startTest() {
        await this.runWarmupPhase();
        await this.showResults();
        await this.runHouseholdPhase();
    }
    
    async runWarmupPhase() {
        this.state = 'warmup';
        // Run connection warmup
        // Calculate 95th percentile
        // Store results
    }
    
    async runHouseholdPhase() {
        this.state = 'household';
        // Start Virtual Household with scaled profiles
        // Pass scaled speeds to server
    }
}
```

### 3. Server-Side Adaptation

#### Dynamic Profile Configuration
```python
# server/websocket_virtual_household.py
class AdaptiveUserProfile(UserProfile):
    def __init__(self, base_profile: UserProfile, scale_factor: float, measured_max: float = None):
        super().__init__(
            name=base_profile.name,
            download_mbps=base_profile.download_mbps * scale_factor if not measured_max else measured_max,
            upload_mbps=base_profile.upload_mbps * scale_factor,
            description=f"{base_profile.description} (Adaptive: {scale_factor:.1f}x)",
            activity_type=base_profile.activity_type,
            burst_pattern=self._scale_burst_pattern(base_profile.burst_pattern, scale_factor)
        )
    
    def _scale_burst_pattern(self, pattern: dict, scale_factor: float) -> dict:
        if pattern['type'] == 'netflix_adaptive':
            return {
                'type': 'netflix_adaptive',
                'burst_duration': pattern['burst_duration'],
                'pause_duration': pattern['pause_duration'],
                'burst_rate': pattern['burst_rate'] * scale_factor,
                'pause_rate': pattern['pause_rate'] * scale_factor
            }
        return pattern
```

#### Adaptive Session Endpoint
```python
@router.post("/virtual-household/adaptive-session")
async def create_adaptive_session(request: AdaptiveSessionRequest):
    """Create Virtual Household session with measured connection speeds"""
    measured_speed = request.measured_95th_percentile
    
    # Calculate scale factor and create adaptive profiles
    scale_factor = measured_speed / 200.0  # Base 200 Mbps
    
    adaptive_profiles = {
        'alex': AdaptiveUserProfile(base_profiles['alex'], scale_factor),
        'sarah': AdaptiveUserProfile(base_profiles['sarah'], scale_factor),
        'jake': AdaptiveUserProfile(base_profiles['jake'], scale_factor),
        'computer': AdaptiveUserProfile(base_profiles['computer'], 1.0, measured_speed)
    }
    
    # Store adaptive profiles for this session
    session_manager.set_adaptive_profiles(request.session_id, adaptive_profiles)
    
    return {"status": "success", "profiles": adaptive_profiles}
```

## File Structure

### New Files
```
client/virtualHousehold/
├── warmupController.js          # Connection warmup logic
├── adaptiveController.js        # Two-phase test orchestration
├── throughputCalculator.js      # 95th percentile calculation
└── adaptiveUI.js               # Phase indicators and results display

server/endpoints/
├── warmup.py                   # Warmup bulk download endpoint
└── adaptive_household.py       # Adaptive session management

server/
└── adaptive_profiles.py        # Dynamic profile scaling logic
```

### Modified Files
```
client/virtualHousehold/
├── virtualHousehold.js         # Integration with adaptive controller
├── uiHousehold.js             # UI updates for two-phase flow
└── virtualHousehold.html       # Phase indicators and results display

server/
└── websocket_virtual_household.py  # Support for adaptive profiles
```

## Implementation Phases

### Phase A: Warmup Infrastructure (2-3 hours)
1. Create warmup controller and throughput calculator
2. Add warmup bulk download endpoint
3. Implement 95th percentile calculation with retry logic
4. Basic UI for warmup progress

### Phase B: Adaptive Scaling (2-3 hours)
1. Create adaptive profile system
2. Implement proportional scaling logic
3. Add adaptive session management
4. Scale burst patterns appropriately

### Phase C: UI Integration (1-2 hours)
1. Two-phase progress indicators
2. Warmup results display
3. Scaled profile preview
4. Smooth transition between phases

### Phase D: Testing & Polish (1 hour)
1. Test with various connection speeds
2. Validate 95th percentile calculations
3. Ensure graceful fallbacks
4. Performance optimization

## Benefits

### User Experience
- **Realistic Testing**: Household simulation matches actual connection capacity
- **Automatic Adaptation**: No manual speed configuration required
- **Transparent Process**: Clear visibility into measurement and scaling
- **Reliable Fallbacks**: Graceful handling of measurement failures

### Technical Advantages
- **Minimal Code Changes**: Builds on existing Virtual Household infrastructure
- **Modular Design**: Warmup and scaling components are independent
- **Backward Compatibility**: Can coexist with current fixed-speed mode
- **Performance Optimized**: Dedicated warmup endpoint for pure throughput testing

## Success Metrics
- Warmup completes successfully >95% of the time
- 95th percentile calculation is within 5% of actual sustained speed
- Household simulation shows realistic congestion patterns
- Total test time remains under 45 seconds (10s + 30s + transitions)