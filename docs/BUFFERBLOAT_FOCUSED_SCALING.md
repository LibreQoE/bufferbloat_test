# Bufferbloat-Focused Adaptive Virtual Household

## Core Principle: Intentional Over-Subscription for SQM Testing

The goal is to **stress-test the user's SQM/QoS** by having the Computer user attempt to consume the full download connection while other household users compete for bandwidth.

## Revised Scaling Strategy

### **Computer User Behavior**
- **Always uses 95th percentile speed** (full measured connection capacity)
- **Intentionally tries to saturate the connection**
- **Tests how well user's SQM handles congestion**

### **Other Users: Realistic Competition**
- Scale proportionally but **don't reduce Computer speed**
- Create realistic household traffic that competes with Computer
- Allow intentional over-subscription to test bufferbloat

## Updated Scaling Formula

```javascript
function bufferbloatTestScaling(measured95thPercentile) {
    // Computer ALWAYS tries to use full connection (this is the point!)
    const computerSpeed = measured95thPercentile;
    
    // Other users scale proportionally to create realistic competition
    const scaleFactor = measured95thPercentile / 200.0; // Base 200 Mbps
    
    return {
        // Household users that compete with Computer downloads
        alex: Math.max(1.0, 1.5 * scaleFactor),      // Gaming: low bandwidth, high priority
        sarah: Math.max(1.5, 2.5 * scaleFactor),     // Video calls: bidirectional, latency sensitive  
        jake: Math.max(5.0, 25.0 * scaleFactor),     // Netflix: bursty, competes for download
        
        // Computer: Always tries to max out connection (bufferbloat test!)
        computer: computerSpeed,
        
        // Upload speeds (fixed ratios, not upload-aware)
        alexUp: Math.max(0.3, 0.75 * scaleFactor),
        sarahUp: Math.max(1.0, 2.5 * scaleFactor),   // Video calls need upload
        jakeUp: 0.1,                                 // Netflix minimal upload
        computerUp: 0.1                              // Computer minimal upload
    };
}
```

## Range Examples: Intentional Over-Subscription

### Low-End Connection: 25 Mbps
- **Alex**: max(1.0, 1.5 × 0.125) = **1.0 Mbps**
- **Sarah**: max(1.5, 2.5 × 0.125) = **1.5 Mbps**  
- **Jake**: max(5.0, 25.0 × 0.125) = **5.0 Mbps**
- **Computer**: **25 Mbps** (tries to use full connection)
- **Total Demand**: 32.5 Mbps vs 25 Mbps capacity
- **Over-subscription**: 130% ✅ **This is intentional for bufferbloat testing!**

### Mid-Range Connection: 100 Mbps  
- **Alex**: max(1.0, 1.5 × 0.5) = **1.0 Mbps**
- **Sarah**: max(1.5, 2.5 × 0.5) = **1.5 Mbps**
- **Jake**: max(5.0, 25.0 × 0.5) = **12.5 Mbps**  
- **Computer**: **100 Mbps** (tries to use full connection)
- **Total Demand**: 115 Mbps vs 100 Mbps capacity
- **Over-subscription**: 115% ✅ **Tests SQM under moderate stress**

### High-End Connection: 1000 Mbps
- **Alex**: max(1.0, 1.5 × 5.0) = **7.5 Mbps**
- **Sarah**: max(1.5, 2.5 × 5.0) = **12.5 Mbps**
- **Jake**: max(5.0, 25.0 × 5.0) = **125 Mbps**
- **Computer**: **1000 Mbps** (tries to use full connection)  
- **Total Demand**: 1145 Mbps vs 1000 Mbps capacity
- **Over-subscription**: 114.5% ✅ **Tests SQM on high-speed connections**

## Why This Design Works for Bufferbloat Testing

### 1. **Realistic Household Stress**
- Computer tries to download at full speed (like Windows updates, game downloads)
- Other users create realistic competing traffic
- Tests real-world scenarios where SQM is needed

### 2. **SQM Validation**
- **Good SQM**: Will prioritize latency-sensitive traffic (Alex gaming, Sarah video)
- **Bad SQM**: Will show high latency spikes when Computer saturates connection
- **No SQM**: Will show severe bufferbloat symptoms

### 3. **Scalable Across Connection Speeds**
- Works on slow connections (25 Mbps DSL with bufferbloat)
- Works on fast connections (1000 Mbps fiber with poor SQM)
- Always creates appropriate stress level

## Phase 1: Download-Only Warmup

### Simplified Warmup (No Upload Measurement)
```javascript
class BufferbloatWarmup {
    constructor() {
        this.samples = [];
        this.sampleInterval = 250; // ms
        this.duration = 10000; // 10 seconds
    }
    
    async measureDownloadOnly() {
        // Only measure download throughput
        // Calculate 95th percentile
        // Return download speed only
        return {
            success: true,
            download95th: calculatedSpeed,
            maxDownload: maxObserved,
            samples: this.samples
        };
    }
}
```

### No Upload Awareness
- **Warmup Phase**: Only measures download speed
- **Scaling**: Uses fixed upload ratios, not measured upload
- **Focus**: Pure download saturation testing

## Expected Bufferbloat Test Behavior

### **With Good SQM/QoS**
1. Computer starts downloading at full speed
2. Alex gaming maintains low latency (SQM prioritizes)
3. Sarah video call stays stable (SQM manages bidirectional)
4. Jake Netflix may buffer slightly but recovers
5. **Result**: Minimal latency increase, good user experience

### **With Poor/No SQM**
1. Computer saturates download connection
2. Alex gaming shows high latency spikes
3. Sarah video call becomes choppy/drops
4. Jake Netflix buffers frequently
5. **Result**: Severe bufferbloat symptoms, poor user experience

### **Measurement Focus**
- **Primary Metric**: Latency increase during congestion
- **Secondary Metrics**: Jitter, packet loss, user experience degradation
- **Goal**: Validate if user's SQM can handle realistic household stress

## Implementation Simplifications

### Remove Upload Complexity
- No upload speed measurement in warmup
- No upload-aware scaling
- Fixed upload ratios based on download scaling
- Focus purely on download saturation testing

### Simplified Scaling Logic
```javascript
function simpleBufferbloatScaling(download95th) {
    const scale = download95th / 200.0;
    
    return {
        alex: { down: Math.max(1.0, 1.5 * scale), up: Math.max(0.3, 0.75 * scale) },
        sarah: { down: Math.max(1.5, 2.5 * scale), up: Math.max(1.0, 2.5 * scale) },
        jake: { down: Math.max(5.0, 25.0 * scale), up: 0.1 },
        computer: { down: download95th, up: 0.1 }
    };
}
```

## Benefits of Bufferbloat-Focused Design

### 1. **Realistic Stress Testing**
- Computer behaves like real bulk downloads
- Other users create authentic competing traffic
- Tests actual SQM effectiveness

### 2. **Clear Pass/Fail Criteria**
- Good SQM: Low latency despite congestion
- Bad SQM: High latency spikes and jitter
- Easy to interpret results

### 3. **Simplified Implementation**
- No complex upload measurement
- No capacity management (over-subscription is intentional)
- Focus on core bufferbloat testing

### 4. **Universal Applicability**
- Works on any connection speed
- Scales stress appropriately
- Tests SQM across full range of deployments

The key insight: **Over-subscription is a feature, not a bug** - it's exactly what we want to test how well the user's SQM handles realistic household congestion scenarios.