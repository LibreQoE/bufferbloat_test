# Speed-Tiered Upload Warmup Implementation Plan

## Problem Statement

Upload warmup currently plateaus at 300 Mbps on 2 Gbps connections due to:
- Insufficient concurrency (only 6 total concurrent uploads: 3 streams × 2 pending each)
- Conservative chunk size discovery (216KB vs 1.25MB achieved by download)
- Inefficient use of fixed 13-second warmup duration

## Solution: Speed-Based Tiered Approach (Fixed Duration)

**Constraint**: Upload warmup duration is fixed at 13 seconds (within 60-second total test)

### Phase 1: HTTP/1.1 Optimized Speed Estimation (3 seconds)
- Start with 3 streams, 1 pending upload each (3 total concurrent uploads)
- Use aggressive chunk progression: 1MB → 2MB → 3MB → 4MB → 6MB
- Progressive ramping every 300ms for rapid high-speed detection
- **HTTP/1.1 constraint**: Limited to 3 concurrent to avoid connection pool issues
- Focus on large chunk sizes rather than high concurrency for performance
- Measure peak throughput in first 3 seconds to classify connection speed

### Phase 2: Speed-Based Parameter Selection (Remaining 10 seconds)

**All tiers use 3 streams × 1 pending = 3 total concurrent uploads (HTTP/1.1 optimized)**

#### Tier 1: Low Speed (< 50 Mbps)
- Streams: 3
- Pending uploads per stream: 1
- Total concurrent uploads: 3
- Max chunk size: 512KB

#### Tier 2: Medium Speed (50-150 Mbps)  
- Streams: 3
- Pending uploads per stream: 1
- Total concurrent uploads: 3
- Max chunk size: 1MB

#### Tier 3: High Speed (150-500 Mbps)
- Streams: 3
- Pending uploads per stream: 1
- Total concurrent uploads: 3
- Max chunk size: 2MB

#### Tier 4: Very High Speed (> 500 Mbps)
- Streams: 3
- Pending uploads per stream: 1
- Total concurrent uploads: 3
- Max chunk size: 6MB

### Phase 3: Immediate Optimization (No Extended Duration)
- Apply tier-specific parameters immediately after 3-second estimation
- Use remaining 10 seconds with optimal parameters
- Early termination if asymmetric (upload << download)

## Implementation Changes

### File: `/opt/libreqos_test/client/simpleWarmup.js`

#### 1. Add Speed Classification
```javascript
classifySpeed(estimatedMbps) {
    if (estimatedMbps < 50) return 'low';
    if (estimatedMbps < 200) return 'medium'; 
    if (estimatedMbps < 800) return 'high';
    return 'very_high';
}
```

#### 2. Speed-Based Parameter Selection
```javascript
getSpeedTierParams(speedTier) {
    const tiers = {
        low: { streams: 3, pendingPerStream: 2, maxChunk: 512 * 1024, duration: 8000 },
        medium: { streams: 3, pendingPerStream: 3, maxChunk: 1024 * 1024, duration: 10000 },
        high: { streams: 3, pendingPerStream: 4, maxChunk: 2 * 1024 * 1024, duration: 12000 },
        very_high: { streams: 3, pendingPerStream: 8, maxChunk: 4 * 1024 * 1024, duration: 15000 }
    };
    return tiers[speedTier];
}
```

#### 3. Modified Upload Warmup Flow
1. **Quick Estimation (2s)**: Use current method to get rough speed
2. **Tier Selection**: Classify speed and select parameters
3. **Optimized Warmup**: Use tier-specific parameters for remaining duration
4. **Early Termination**: Stop if upload speed is < 20% of download speed (asymmetric)

### Expected Results

#### Current Behavior (2 Gbps connection)
- Warmup discovers: 216KB chunks, 6 concurrent uploads
- Peak throughput: ~300 Mbps

#### Expected Behavior (2 Gbps connection)
- HTTP/1.1 optimized estimation (3s): ~500-700 Mbps (classified as "very_high")
- Tier parameters: 3 concurrent uploads, 6MB chunks
- Optimization phase: 10 seconds with optimal parameters
- Expected peak: 800-1200 Mbps (eliminates connection pool bottlenecks)

## Implementation Priority

1. **High**: Speed classification and tier parameter selection
2. **High**: Modified upload warmup with 2-second estimation phase
3. **Medium**: Early termination for asymmetric connections
4. **Low**: Fine-tuning tier thresholds based on real-world testing

## HTTP/1.1 Optimization Benefits

- **Eliminates connection pool exhaustion** (stays within 6-connection browser limit)
- **Prevents upload errors** from over-aggressive concurrency
- **Removes request queuing bottlenecks** that throttle performance
- **Focus on chunk size optimization** for bandwidth utilization
- **Maintains compatibility** with all HTTP/1.1 servers and browsers

## Bidirectional Phase Optimization

- **Upload**: 3 concurrent uploads (3 streams × 1 pending)
- **Download**: 3 concurrent downloads (3 streams × 1 pending)  
- **Total**: 6 concurrent requests (3 up + 3 down)
- **Still within HTTP/1.1 limits** while testing both directions simultaneously

## Testing Strategy

1. Test on various connection speeds: 25 Mbps, 100 Mbps, 500 Mbps, 1 Gbps, 2 Gbps
2. Verify latency tolerance during aggressive phases
3. Confirm graceful degradation for asymmetric connections
4. Validate parameter storage for saturation phases