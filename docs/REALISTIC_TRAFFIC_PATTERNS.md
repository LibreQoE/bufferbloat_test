# Realistic Virtual Household Traffic Patterns

## Overview
Updated the Virtual Household test to use realistic traffic patterns instead of artificial 5 Mbps bidirectional flows for all users. This provides more accurate bufferbloat testing while reducing artificial contention.

## New Traffic Patterns

### Alex (Gamer) - Constant Low Latency
- **Download**: 1.5 Mbps (constant)
- **Upload**: 0.75 Mbps (constant)
- **Pattern**: Steady, low-bandwidth gaming traffic
- **Behavior**: Prioritizes low latency over high throughput

### Sarah (Video Call) - Bidirectional Constant
- **Download**: 2.5 Mbps (constant)
- **Upload**: 2.5 Mbps (constant)
- **Pattern**: Steady HD video conferencing
- **Behavior**: Consistent bidirectional flow for video/audio

### Jake (Netflix) - Bursty Streaming ⭐
- **Download**: 25 Mbps → 0 Mbps (bursty)
- **Upload**: 0.1 Mbps (minimal telemetry)
- **Pattern**: 5 seconds at 25 Mbps, then 10 seconds at 0 Mbps
- **Behavior**: Realistic adaptive bitrate streaming with buffer filling cycles

### Computer (Updates) - Bursty Downloads ⭐
- **Download**: 30 Mbps → 2 Mbps (bursty)
- **Upload**: 2 Mbps (constant backup)
- **Pattern**: 8 seconds at 30 Mbps, then 20 seconds at 2 Mbps
- **Behavior**: System updates with background sync

## Traffic Load Comparison

### Before (Artificial)
- **Total Constant Load**: 20 Mbps down + 20 Mbps up = 40 Mbps
- **Pattern**: All users synchronized, constant load
- **Realism**: Low (no real household has 4×5 Mbps constant flows)

### After (Realistic)
- **Peak Load**: 59.1 Mbps down + 6.25 Mbps up = 65.35 Mbps
- **Average Load**: ~15-20 Mbps down + ~6 Mbps up = ~25 Mbps
- **Pattern**: Bursty, staggered, realistic usage
- **Realism**: High (matches real household patterns)

## Implementation Details

### Server-Side (`websocket_virtual_household.py`)
- Added `UserProfile.burst_pattern` configuration
- Added `TrafficSession.burst_state` tracking
- Implemented `get_current_effective_rate()` method
- Enhanced traffic generation with burst pattern support

### Client-Side (`virtualHousehold.js`)
- Updated user configurations to match server patterns
- Enhanced status messages for Netflix buffering states
- Updated Computer messages for update/backup behavior

## Benefits

1. **More Realistic Testing**: Matches actual household usage patterns
2. **Better Bufferbloat Detection**: Shows how real applications adapt to congestion
3. **Reduced Artificial Contention**: Less synchronized traffic bursts
4. **Dynamic Behavior**: Users experience varies based on network performance
5. **Educational Value**: Demonstrates real-world streaming/gaming behavior

## Expected Behavior

### Jake (Netflix)
- **Burst Phase**: "Buffer full, HD streaming!" (25 Mbps for 5s)
- **Pause Phase**: "Buffering for HD content" (0 Mbps for 10s)
- **Adaptation**: Quality drops under network stress

### Computer (Updates)
- **Active Phase**: "Downloading updates rapidly" (30 Mbps for 8s)
- **Background Phase**: "Background sync active" (2 Mbps for 20s)
- **Behavior**: Adapts download strategy based on available bandwidth

### Network Impact
- **Peak Congestion**: When Jake + Computer burst simultaneously
- **Quiet Periods**: When both are in pause/background phases
- **Realistic Stress**: Mimics real household bandwidth competition

## Testing Notes

The new patterns will create more realistic bufferbloat conditions:
- **Variable Load**: Network equipment experiences realistic traffic variations
- **Adaptive Behavior**: Applications respond to congestion like real software
- **Latency Spikes**: Occur during burst phases, recover during quiet periods
- **Real-World Relevance**: Results directly applicable to actual household scenarios