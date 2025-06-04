# Final Adaptive Virtual Household Design

## Core Design: Computer-Only Adaptive Scaling

### **Principle**
- **Only Computer user** scales based on measured connection speed (95th percentile)
- **All other users** keep their current fixed throughputs
- **Simple, focused implementation** for bufferbloat testing

## Scaling Logic

### **Fixed User Profiles (Unchanged)**
```javascript
const FIXED_PROFILES = {
    alex: { download: 1.5, upload: 0.75 },      // Gaming - unchanged
    sarah: { download: 2.5, upload: 2.5 },      // Video calls - unchanged  
    jake: { download: 25.0, upload: 0.1 }       // Netflix - unchanged
};
```

### **Computer User: Adaptive Only**
```javascript
function createAdaptiveProfiles(measured95thPercentile) {
    return {
        alex: FIXED_PROFILES.alex,           // 1.5 Mbps down, 0.75 Mbps up
        sarah: FIXED_PROFILES.sarah,         // 2.5 Mbps down, 2.5 Mbps up
        jake: FIXED_PROFILES.jake,           // 25.0 Mbps down, 0.1 Mbps up
        computer: {                          // ADAPTIVE: Uses measured speed
            download: measured95thPercentile,
            upload: 0.1
        }
    };
}
```

## Range Examples

### Low-End Connection: 25 Mbps
- **Alex**: 1.5 Mbps (fixed)
- **Sarah**: 2.5 Mbps (fixed)
- **Jake**: 25.0 Mbps (fixed)
- **Computer**: **25 Mbps** (adaptive - uses measured speed)
- **Total Demand**: 54.0 Mbps vs 25 Mbps capacity
- **Over-subscription**: 216% - **Strong bufferbloat test**

### Mid-Range Connection: 100 Mbps
- **Alex**: 1.5 Mbps (fixed)
- **Sarah**: 2.5 Mbps (fixed)  
- **Jake**: 25.0 Mbps (fixed)
- **Computer**: **100 Mbps** (adaptive - uses measured speed)
- **Total Demand**: 129.0 Mbps vs 100 Mbps capacity
- **Over-subscription**: 129% - **Moderate bufferbloat test**

### High-End Connection: 1000 Mbps
- **Alex**: 1.5 Mbps (fixed)
- **Sarah**: 2.5 Mbps (fixed)
- **Jake**: 25.0 Mbps (fixed)  
- **Computer**: **1000 Mbps** (adaptive - uses measured speed)
- **Total Demand**: 1029.0 Mbps vs 1000 Mbps capacity
- **Over-subscription**: 103% - **Light bufferbloat test**

## Implementation

### Phase 1: Download Warmup (10 seconds)
```javascript
class SimpleWarmup {
    async measureConnection() {
        // Simple bulk download for 10 seconds
        // Sample throughput every 250ms (40 samples)
        // Calculate 95th percentile
        // Return only download speed
        
        return {
            success: true,
            download95th: calculatedSpeed
        };
    }
}
```

### Phase 2: Adaptive Virtual Household (30 seconds)
```javascript
class AdaptiveVirtualHousehold {
    async startTest(measured95thPercentile) {
        const profiles = {
            alex: { download: 1.5, upload: 0.75 },
            sarah: { download: 2.5, upload: 2.5 },
            jake: { download: 25.0, upload: 0.1 },
            computer: { download: measured95thPercentile, upload: 0.1 }
        };
        
        // Start Virtual Household with these profiles
        await this.startVirtualHousehold(profiles);
    }
}
```

### Server-Side Changes
```python
# server/websocket_virtual_household.py
def create_adaptive_computer_profile(measured_speed: float) -> UserProfile:
    """Create Computer profile with measured speed, others unchanged"""
    return UserProfile(
        name='Computer (Updates)',
        download_mbps=measured_speed,  # Use measured 95th percentile
        upload_mbps=0.1,              # Fixed upload
        description=f'Adaptive downloads at {measured_speed:.1f} Mbps',
        activity_type='bulk_transfer',
        burst_pattern={'type': 'constant'}
    )

# Other profiles remain exactly the same
FIXED_USER_PROFILES = {
    'alex': UserProfile(name='Alex (Gamer)', download_mbps=1.5, upload_mbps=0.75, ...),
    'sarah': UserProfile(name='Sarah (Video Call)', download_mbps=2.5, upload_mbps=2.5, ...),
    'jake': UserProfile(name='Jake (Netflix)', download_mbps=25.0, upload_mbps=0.1, ...)
}
```

## Benefits of Computer-Only Scaling

### 1. **Simplicity**
- Minimal code changes required
- Only Computer user logic needs modification
- Other users remain exactly as they are

### 2. **Consistent Baseline**
- Alex, Sarah, Jake provide consistent household traffic
- Only Computer varies based on connection speed
- Predictable test behavior

### 3. **Clear Bufferbloat Testing**
- Fixed household users create known competing traffic
- Computer tries to saturate remaining bandwidth
- Easy to interpret latency impact

### 4. **Universal Scaling**
- Works on any connection speed
- Computer automatically adapts to available bandwidth
- Other users provide realistic household context

## Expected Test Behavior

### **Slow Connections (25 Mbps)**
- Fixed users (29 Mbps) already exceed connection capacity
- Computer (25 Mbps) adds significant additional stress
- **Strong bufferbloat test** - tests SQM under heavy load

### **Fast Connections (1000 Mbps)**  
- Fixed users (29 Mbps) use small portion of capacity
- Computer (1000 Mbps) tries to use remaining bandwidth
- **Realistic household stress** - tests SQM with bulk downloads

### **SQM Validation**
- **Good SQM**: Alex gaming stays responsive, Sarah video stable
- **Bad SQM**: High latency spikes when Computer downloads
- **Clear pass/fail criteria** based on latency measurements

## Implementation Files

### New Files (Minimal)
```
client/virtualHousehold/
├── warmupController.js          # Simple 10-second download warmup
└── adaptiveController.js        # Orchestrates warmup → household test

server/endpoints/
└── warmup.py                   # Bulk download endpoint for warmup
```

### Modified Files (Minimal)
```
client/virtualHousehold/
├── virtualHousehold.js         # Add adaptive Computer profile support
└── uiHousehold.js             # Add warmup phase UI

server/
└── websocket_virtual_household.py  # Add adaptive Computer profile creation
```

## Implementation Timeline

### Phase A: Warmup (1-2 hours)
- Simple bulk download warmup controller
- 95th percentile calculation
- Basic warmup progress UI

### Phase B: Adaptive Computer (1 hour)  
- Modify Computer user to accept dynamic speed
- Add adaptive profile creation
- Integration with warmup results

### Phase C: UI Integration (30 minutes)
- Two-phase progress indicator
- Show measured speed and start household test
- Smooth transition between phases

**Total Implementation**: 2.5-3.5 hours

## Success Criteria

✅ **Warmup measures connection speed accurately**  
✅ **Computer user uses 95th percentile speed**  
✅ **Other users remain at fixed speeds**  
✅ **Total test time under 45 seconds**  
✅ **Clear bufferbloat symptoms with poor SQM**  
✅ **Minimal latency increase with good SQM**

This design is **simple, focused, and practical** - exactly what's needed for effective bufferbloat testing across the full range of connection speeds.