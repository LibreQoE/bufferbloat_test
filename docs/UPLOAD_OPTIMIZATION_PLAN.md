# Upload Optimization Plan: Fixed Concurrency, Variable Chunk Size

## Problem Statement

The current upload warmup implementation allows pendingUploads to grow unbounded (up to 40 per stream, 120 total), causing:
- Throughput collapse around 29 seconds into the test
- TCP buffer exhaustion
- Severe queuing delays
- Poor recovery until the bidirectional phase

## Solution: Fix pendingUploads, Vary Chunk Size

### Core Principle

- **Fixed concurrency**: 2 pending uploads per stream (6 total across 3 streams)
- **Variable chunk size**: Adapt chunk size based on connection speed
- **Quick adaptation**: Change chunk size every iteration without waiting for queue drainage

### Implementation Details

#### 1. Fixed Pending Upload Configuration

```javascript
const PENDING_UPLOADS_PER_STREAM = 2;  // Fixed at 2
const UPLOAD_STREAMS = 3;              // Keep 3 streams
const TOTAL_CONCURRENT = PENDING_UPLOADS_PER_STREAM * UPLOAD_STREAMS; // 6 total
```

#### 2. Dynamic Chunk Size Calculation

```javascript
function getOptimalChunkSize(speedMbps, baselineLatencyMs) {
    // Target: chunks should complete in 4x RTT for good pacing
    const targetUploadTimeMs = Math.max(100, baselineLatencyMs * 4);
    const bytesPerMs = (speedMbps * 1024 * 1024) / (8 * 1000);
    const idealChunkSize = bytesPerMs * targetUploadTimeMs;
    
    // Clamp to reasonable bounds
    return Math.max(8 * 1024,        // 8KB minimum
           Math.min(4 * 1024 * 1024,  // 4MB maximum
                    Math.floor(idealChunkSize)));
}
```

#### 3. Upload Warmup Algorithm

```javascript
async runUploadWarmup() {
    // Fixed concurrency
    const pendingPerStream = 2;
    
    // Starting chunk size based on any previous measurements
    let currentChunkSize = this.getInitialChunkSize();
    let bestChunkSize = currentChunkSize;
    let bestThroughput = 0;
    
    // Ramp up chunk size over warmup period
    while (timeRemaining > 0) {
        // Create streams with fixed pending uploads
        const streams = await this.createUploadStreams({
            streamCount: 3,
            pendingUploads: pendingPerStream,
            chunkSize: currentChunkSize
        });
        
        // Measure for 1 second
        await sleep(1000);
        const throughput = this.getCurrentThroughput();
        const latency = this.getCurrentLatency();
        
        // Check if we should adjust
        if (latency < baselineLatency * 2 && throughput > bestThroughput) {
            // Latency is good and throughput improved
            bestThroughput = throughput;
            bestChunkSize = currentChunkSize;
            
            // Try larger chunks
            currentChunkSize = Math.min(currentChunkSize * 1.5, 4 * 1024 * 1024);
        } else if (latency > baselineLatency * 3) {
            // Latency too high, back off
            currentChunkSize = currentChunkSize * 0.75;
            break;
        } else {
            // No improvement, we've found the sweet spot
            break;
        }
    }
    
    return {
        streamCount: 3,
        pendingUploads: pendingPerStream,
        chunkSize: bestChunkSize
    };
}
```

#### 4. Expected Behavior by Connection Speed

| Connection Speed | Chunk Size | Upload Time/Chunk | Total Concurrent | Effective Rate |
|-----------------|------------|-------------------|------------------|----------------|
| 256 kbps        | 8-16 KB    | 250-500ms        | 6                | ~192 kbps      |
| 1 Mbps          | 32-64 KB   | 250-500ms        | 6                | ~768 kbps      |
| 10 Mbps         | 128-256 KB | 100-200ms        | 6                | ~7.5 Mbps      |
| 100 Mbps        | 1-2 MB     | 80-160ms         | 6                | ~75 Mbps       |
| 1 Gbps          | 2-4 MB     | 16-32ms          | 6                | ~750 Mbps      |

### Benefits

1. **Predictable Load**: Always exactly 6 concurrent uploads
2. **No Buffer Exhaustion**: Limited concurrency prevents buffer overflow
3. **Quick Adaptation**: Chunk size changes take effect immediately
4. **Natural Pacing**: Larger chunks on fast connections prevent request flooding
5. **Smooth Transitions**: No pending upload backlog between phases

### Migration Path

1. Update `simpleWarmup.js` to use fixed pendingUploads
2. Implement dynamic chunk sizing based on measured throughput
3. Add chunk size bounds checking
4. Ensure proper chunk size propagation to saturation phase
5. Test across various connection speeds

### Success Metrics

- No throughput collapse during upload warmup
- Smooth transition between warmup and saturation phases
- Consistent upload performance across all phases
- Quick convergence to optimal chunk size (within 3-4 seconds)