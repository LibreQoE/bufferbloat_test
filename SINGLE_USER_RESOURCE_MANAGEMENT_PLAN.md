# Single User Mode Resource Management Plan

## Problem Statement

Users report that Single User Mode tests sometimes continue moving data (server to client) after test completion when they leave the tab open. Current cleanup mechanisms are insufficient to guarantee stream termination.

## Current Vulnerabilities Analysis

### ❌ **Critical Gaps Identified**

1. **Incomplete Test Completion Cleanup**
   - Test complete handler doesn't explicitly terminate all streams
   - Relies on implicit cleanup that may fail
   - No verification that streams actually stopped

2. **No Periodic Health Checks**
   - No mechanism to verify streams are still needed
   - Streams can continue indefinitely if cleanup fails
   - No automatic timeout for orphaned streams

3. **No Session Timeout**
   - Streams lack maximum duration limits
   - No automatic termination after reasonable time periods
   - Risk of runaway streams consuming resources indefinitely

4. **Race Conditions in Cleanup**
   - Multiple cleanup paths can interfere with each other
   - Cleanup may not execute if page unload is interrupted
   - No guaranteed cleanup order or completion verification

5. **Insufficient Stream State Management**
   - Limited tracking of stream lifecycle states
   - No centralized stream health monitoring
   - Unclear stream ownership and responsibility

## Implementation Status: **PHASE 1 COMPLETE** ✅

**Phase 1 Critical Fixes** have been successfully implemented and are ready for testing. The following components have been enhanced with comprehensive resource cleanup mechanisms:

- ✅ **Enhanced Test Completion Cleanup**: [`client/app.js`](client/app.js:handleTestComplete) - Mandatory stream termination on test complete
- ✅ **Emergency Cleanup Mechanism**: [`client/streamManager.js`](client/streamManager.js:emergencyCleanup) - Force termination when graceful cleanup fails
- ✅ **Stream Termination Verification**: [`client/streamManager.js`](client/streamManager.js:terminateAllStreams) - Timeout and verification for all stream termination
- ✅ **Enhanced Individual Stream Termination**: [`client/streamManager.js`](client/streamManager.js:terminateStream) - Improved error handling and timeout mechanisms
- ✅ **Test File Created**: [`client/test_phase1_cleanup.html`](client/test_phase1_cleanup.html) - Comprehensive test interface for verifying Phase 1 implementation

## Comprehensive Solution Plan

### **Phase 1: Enhanced Test Completion Cleanup** ✅ **IMPLEMENTED**

#### 1.1 Mandatory Stream Termination on Test Complete

**Implementation Location**: [`client/app.js`](client/app.js) - `handleTestComplete()` function

**Changes Required**:
```javascript
async function handleTestComplete() {
    console.log('Test complete - initiating comprehensive cleanup');
    updateTestStatus('🎉 Test Complete', 'Cleaning up resources and analyzing results...');
    
    // CRITICAL: Stop all streams FIRST before any other cleanup
    console.log('🛑 MANDATORY: Terminating all active streams');
    await StreamManager.terminateAllStreams();
    
    // Verify streams are actually terminated
    const remainingStreams = StreamManager.getActiveStreamCounts();
    if (remainingStreams.total > 0) {
        console.warn(`⚠️ WARNING: ${remainingStreams.total} streams still active after termination attempt`);
        // Force emergency cleanup
        await StreamManager.emergencyCleanup();
    }
    
    // End current phase
    await phaseController.endPhase();
    
    // Stop the latency worker
    if (latencyWorker) {
        latencyWorker.postMessage({ command: 'stop' });
        latencyWorker.terminate();
        latencyWorker = null;
    }
    
    // Stop throughput monitor
    stopThroughputMonitor();
    
    // Stop throughput tracker
    throughputTracker.stopTracking();
    
    // Continue with existing analysis...
}
```

#### 1.2 Emergency Cleanup Mechanism

**Implementation Location**: [`client/streamManager.js`](client/streamManager.js)

**New Method**:
```javascript
/**
 * Emergency cleanup - force terminate all streams with extreme prejudice
 * @returns {Promise} A promise that resolves when emergency cleanup is complete
 */
static async emergencyCleanup() {
    console.log('🚨 EMERGENCY CLEANUP: Force terminating all streams');
    
    // Force abort all controllers
    for (const [streamId, stream] of this.streams.download) {
        if (stream.controller) {
            stream.controller.abort();
        }
        if (stream.reader && !stream.readerCancelled) {
            try {
                await stream.reader.cancel();
            } catch (e) {
                // Ignore errors during emergency cleanup
            }
        }
        stream.active = false;
    }
    
    for (const [streamId, stream] of this.streams.upload) {
        stream.active = false;
    }
    
    // Clear all registries
    this.streams.download.clear();
    this.streams.upload.clear();
    
    // Dispatch emergency cleanup event
    window.dispatchEvent(new CustomEvent('stream:emergency_cleanup', {
        detail: { timestamp: performance.now() }
    }));
    
    console.log('✅ Emergency cleanup complete');
}
```

### **Phase 2: Automatic Session Timeout System**

#### 2.1 Stream Timeout Management

**Implementation Location**: [`client/streamManager.js`](client/streamManager.js)

**Enhanced Stream Registration**:
```javascript
static registerStream(type, stream) {
    const streamId = this.generateId();
    stream.id = streamId;
    stream.type = type;
    stream.createdAt = performance.now();
    stream.active = true;
    
    // NEW: Add timeout management
    stream.maxDuration = 300000; // 5 minutes maximum
    stream.lastActivity = performance.now();
    stream.timeoutWarned = false;
    
    this.streams[type].set(streamId, stream);
    
    // Start timeout monitoring for this stream
    this.startStreamTimeoutMonitoring(streamId, type);
    
    this.dispatchStreamEvent('created', streamId, type);
    return streamId;
}

/**
 * Start timeout monitoring for a specific stream
 * @param {string} streamId - The stream ID
 * @param {string} type - The stream type
 */
static startStreamTimeoutMonitoring(streamId, type) {
    const checkInterval = 30000; // Check every 30 seconds
    
    const timeoutChecker = setInterval(() => {
        const stream = this.streams[type].get(streamId);
        if (!stream || !stream.active) {
            clearInterval(timeoutChecker);
            return;
        }
        
        const now = performance.now();
        const age = now - stream.createdAt;
        const timeSinceActivity = now - stream.lastActivity;
        
        // Warn at 4 minutes
        if (age > 240000 && !stream.timeoutWarned) {
            console.warn(`⚠️ Stream ${streamId} approaching timeout (${Math.round(age/1000)}s old)`);
            stream.timeoutWarned = true;
        }
        
        // Force terminate at 5 minutes OR 2 minutes of inactivity
        if (age > stream.maxDuration || timeSinceActivity > 120000) {
            console.warn(`🛑 TIMEOUT: Force terminating stream ${streamId} (age: ${Math.round(age/1000)}s, inactive: ${Math.round(timeSinceActivity/1000)}s)`);
            this.terminateStream(streamId, type);
            clearInterval(timeoutChecker);
        }
    }, checkInterval);
    
    // Store timeout checker reference for cleanup
    stream.timeoutChecker = timeoutChecker;
}
```

#### 2.2 Activity Tracking

**Implementation Location**: [`client/streamManager.js`](client/streamManager.js)

**Enhanced Stream Processing**:
```javascript
static async processStream(stream, reader) {
    try {
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                break;
            }
            
            // Process the chunk
            stream.bytesReceived += value.length;
            
            // NEW: Update activity timestamp
            stream.lastActivity = performance.now();
            
            // If delay is needed for pacing
            if (stream.options.addDelay) {
                const delayMs = stream.options.chunkDelay || 10;
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        
        // Mark reader as cancelled since it completed normally
        stream.readerCancelled = true;
        
        if (stream.active) {
            this.terminateStream(stream.id, stream.type);
        }
        return true;
    } catch (error) {
        this.handleStreamError(stream, error);
        return false;
    }
}
```

### **Phase 3: Periodic Health Check System**

#### 3.1 Global Stream Health Monitor

**Implementation Location**: [`client/app.js`](client/app.js)

**New Health Check System**:
```javascript
/**
 * Stream Health Monitor - periodically checks and cleans up orphaned streams
 */
class StreamHealthMonitor {
    constructor() {
        this.isRunning = false;
        this.checkInterval = null;
        this.maxTestDuration = 300000; // 5 minutes total test duration
        this.testStartTime = null;
    }
    
    start(testStartTime) {
        if (this.isRunning) {
            this.stop();
        }
        
        this.testStartTime = testStartTime;
        this.isRunning = true;
        
        console.log('🔍 Starting stream health monitor');
        
        this.checkInterval = setInterval(() => {
            this.performHealthCheck();
        }, 15000); // Check every 15 seconds
    }
    
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.isRunning = false;
        console.log('🔍 Stream health monitor stopped');
    }
    
    performHealthCheck() {
        const now = performance.now();
        const testDuration = this.testStartTime ? now - this.testStartTime : 0;
        
        // Check if test has been running too long
        if (testDuration > this.maxTestDuration) {
            console.warn(`🚨 TEST TIMEOUT: Test running for ${Math.round(testDuration/1000)}s, forcing cleanup`);
            this.forceTestCleanup();
            return;
        }
        
        // Check stream health
        const streamCounts = StreamManager.getActiveStreamCounts();
        const currentPhase = getCurrentPhase();
        
        console.log(`🔍 Health check: ${streamCounts.total} active streams, phase: ${currentPhase}, duration: ${Math.round(testDuration/1000)}s`);
        
        // Check for orphaned streams based on current phase
        this.checkForOrphanedStreams(currentPhase, testDuration);
    }
    
    checkForOrphanedStreams(currentPhase, testDuration) {
        const streamCounts = StreamManager.getActiveStreamCounts();
        
        // If test should be complete but streams are still active
        if (currentPhase === null && streamCounts.total > 0) {
            console.warn(`🚨 ORPHANED STREAMS: ${streamCounts.total} streams active after test completion`);
            StreamManager.emergencyCleanup();
        }
        
        // If in baseline phase but have active streams (shouldn't happen)
        if (currentPhase === TEST_PHASES.BASELINE && streamCounts.total > 0) {
            console.warn(`🚨 UNEXPECTED STREAMS: ${streamCounts.total} streams active during baseline phase`);
            StreamManager.emergencyCleanup();
        }
    }
    
    forceTestCleanup() {
        console.log('🛑 FORCE TEST CLEANUP: Terminating test due to timeout');
        
        // Stop all streams
        StreamManager.emergencyCleanup();
        
        // Stop latency worker
        if (latencyWorker) {
            latencyWorker.postMessage({ command: 'stop' });
            latencyWorker.terminate();
            latencyWorker = null;
        }
        
        // Stop throughput monitoring
        stopThroughputMonitor();
        
        // Update UI
        updateTestStatus('⚠️ Test Timeout', 'Test exceeded maximum duration and was terminated');
        
        // Stop health monitor
        this.stop();
    }
}

// Create global health monitor instance
const streamHealthMonitor = new StreamHealthMonitor();
```

#### 3.2 Integration with Test Lifecycle

**Implementation Location**: [`client/app.js`](client/app.js)

**Enhanced Test Start Handler**:
```javascript
function handleTestStart() {
    console.log('🎯 ADAPTIVE WARMUP: Test starting with forced adaptive warmup');
    
    updateTestStatus('🚀 Starting Test', 'Initializing bufferbloat test environment...');
    
    // Reset test data
    resetTestData();
    
    // Reset charts
    resetChart(latencyChart);
    resetThroughputChart(throughputChart);
    
    // Initialize phase controller
    const testStartTime = performance.now();
    phaseController.initialize(testStartTime);
    
    // NEW: Start stream health monitoring
    streamHealthMonitor.start(testStartTime);
    
    // Start throughput monitor
    startThroughputMonitor(testStartTime);
    
    // Continue with existing initialization...
}
```

**Enhanced Test Complete Handler**:
```javascript
async function handleTestComplete() {
    console.log('Test complete');
    updateTestStatus('🎉 Test Complete', 'Analyzing results and calculating bufferbloat score...');
    
    // NEW: Stop health monitor FIRST
    streamHealthMonitor.stop();
    
    // CRITICAL: Stop all streams before any other cleanup
    console.log('🛑 MANDATORY: Terminating all active streams');
    await StreamManager.terminateAllStreams();
    
    // Verify cleanup
    const remainingStreams = StreamManager.getActiveStreamCounts();
    if (remainingStreams.total > 0) {
        console.warn(`⚠️ WARNING: ${remainingStreams.total} streams still active after termination`);
        await StreamManager.emergencyCleanup();
    }
    
    // Continue with existing cleanup...
}
```

### **Phase 4: Enhanced Stream State Management**

#### 4.1 Improved Stream Termination

**Implementation Location**: [`client/streamManager.js`](client/streamManager.js)

**Enhanced Termination Method**:
```javascript
static async terminateStream(streamId, type) {
    const streamMap = this.streams[type];
    const stream = streamMap.get(streamId);
    
    if (!stream) return false;
    
    console.log(`🛑 Terminating ${type} stream ${streamId}`);
    
    try {
        // Clear timeout checker if it exists
        if (stream.timeoutChecker) {
            clearInterval(stream.timeoutChecker);
            stream.timeoutChecker = null;
        }
        
        // Mark as inactive immediately to prevent new operations
        stream.active = false;
        
        // Multiple termination mechanisms with timeout
        const terminationPromises = [];
        
        if (stream.controller) {
            terminationPromises.push(
                Promise.resolve().then(() => {
                    stream.controller.abort();
                    stream.controller = null;
                })
            );
        }
        
        if (stream.reader && !stream.readerCancelled) {
            terminationPromises.push(
                Promise.race([
                    stream.reader.cancel().then(() => {
                        stream.readerCancelled = true;
                    }),
                    new Promise(resolve => setTimeout(resolve, 1000)) // 1 second timeout
                ]).catch(e => {
                    if (e.name !== 'AbortError') {
                        console.warn(`Error cancelling reader for stream ${streamId}:`, e);
                    }
                })
            );
        }
        
        // Wait for termination with timeout
        await Promise.race([
            Promise.all(terminationPromises),
            new Promise(resolve => setTimeout(resolve, 2000)) // 2 second max wait
        ]);
        
        // Clear all references
        stream.reader = null;
        stream.promise = null;
        
        // Remove from registry
        streamMap.delete(streamId);
        
        // Dispatch termination event
        this.dispatchStreamEvent('terminated', streamId, type);
        
        console.log(`✅ Stream ${streamId} terminated successfully`);
        return true;
    } catch (error) {
        console.error(`Error terminating stream ${streamId}:`, error);
        
        // Force removal even if error occurs
        streamMap.delete(streamId);
        
        return false;
    }
}
```

#### 4.2 Comprehensive Cleanup Verification

**Implementation Location**: [`client/streamManager.js`](client/streamManager.js)

**Enhanced terminateAllStreams Method**:
```javascript
static async terminateAllStreams() {
    console.log('🛑 TERMINATING ALL STREAMS');
    
    const initialCounts = this.getActiveStreamCounts();
    console.log(`Initial active streams: ${initialCounts.download} download, ${initialCounts.upload} upload`);
    
    if (initialCounts.total === 0) {
        console.log('✅ No active streams to terminate');
        return true;
    }
    
    const downloadPromises = Array.from(this.streams.download.keys())
        .map(id => this.terminateStream(id, 'download'));
        
    const uploadPromises = Array.from(this.streams.upload.keys())
        .map(id => this.terminateStream(id, 'upload'));
        
    // Wait for all terminations with timeout
    try {
        await Promise.race([
            Promise.all([...downloadPromises, ...uploadPromises]),
            new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
        ]);
    } catch (error) {
        console.warn('Some streams failed to terminate gracefully:', error);
    }
    
    // Verify cleanup
    const finalCounts = this.getActiveStreamCounts();
    console.log(`Final active streams: ${finalCounts.download} download, ${finalCounts.upload} upload`);
    
    // Force cleanup if necessary
    if (finalCounts.total > 0) {
        console.warn(`⚠️ ${finalCounts.total} streams still active, forcing cleanup`);
        await this.emergencyCleanup();
        
        // Final verification
        const emergencyCounts = this.getActiveStreamCounts();
        if (emergencyCounts.total > 0) {
            console.error(`❌ CRITICAL: ${emergencyCounts.total} streams still active after emergency cleanup`);
        } else {
            console.log('✅ Emergency cleanup successful');
        }
    } else {
        console.log('✅ All streams terminated successfully');
    }
    
    return true;
}
```

## Implementation Timeline

### **Phase 1: Critical Fixes (Immediate - 2 hours)**
1. Enhanced test completion cleanup with mandatory stream termination
2. Emergency cleanup mechanism
3. Stream termination verification

### **Phase 2: Timeout System (1-2 hours)**
1. Stream timeout management
2. Activity tracking
3. Automatic timeout enforcement

### **Phase 3: Health Monitoring (1-2 hours)**
1. Global stream health monitor
2. Periodic health checks
3. Orphaned stream detection

### **Phase 4: Enhanced Management (1 hour)**
1. Improved stream state management
2. Comprehensive cleanup verification
3. Robust error handling

**Total Implementation Time**: 5-7 hours

## Success Criteria

### **Immediate Success Indicators**
- ✅ Zero active streams after test completion
- ✅ No data transfer after test ends
- ✅ Automatic cleanup within 30 seconds of test completion
- ✅ No streams surviving longer than 5 minutes

### **Long-term Reliability Indicators**
- ✅ No user reports of continued data transfer
- ✅ Consistent cleanup across all browsers
- ✅ Graceful handling of network interruptions
- ✅ Proper resource cleanup on page navigation

## Testing Strategy

### **Automated Testing**
1. **Stream Lifecycle Tests**: Verify proper creation and termination
2. **Timeout Tests**: Ensure streams terminate after maximum duration
3. **Cleanup Tests**: Verify all cleanup mechanisms work correctly
4. **Edge Case Tests**: Test network failures, rapid navigation, etc.

### **Manual Testing**
1. **Complete Test Cycle**: Run full test and verify cleanup
2. **Interrupted Test**: Stop test mid-way and verify cleanup
3. **Tab Switch Test**: Switch tabs during test and verify behavior
4. **Network Disconnect**: Disconnect network and verify cleanup

This comprehensive plan addresses all identified vulnerabilities while maintaining the existing functionality and performance characteristics of the Single User Mode.