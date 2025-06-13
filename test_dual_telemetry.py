#!/usr/bin/env python3
"""
Test script for dual telemetry system
Tests the flow: client_ip → asn_lookup → forward_to_isp(ip+asn+data) → store_in_db(asn+data)
"""

import asyncio
import json
import aiohttp
import time
from datetime import datetime

# Test data matching client telemetry format
TEST_RESULTS = {
    "telemetry_enabled": True,
    "timestamp": datetime.now().isoformat(),
    "results": {
        "test_type": "single",
        "grades": {
            "overall": "B",
            "download": "A",
            "upload": "B",
            "bidirectional": "C"
        },
        "metrics": {
            "baseline_latency_ms": 25.3,
            "download_latency_increase_ms": 45.2,
            "upload_latency_increase_ms": 67.8,
            "bidirectional_latency_increase_ms": 89.1,
            "download_throughput_mbps": 95.3,
            "upload_throughput_mbps": 12.7
        }
    }
}

async def test_isp_server_telemetry():
    """Test ISP server telemetry (local storage + central forwarding)"""
    print("🧪 Testing ISP server telemetry submission...")
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                'http://localhost:8000/api/telemetry',
                json=TEST_RESULTS,
                headers={'Content-Type': 'application/json', 'User-Agent': 'TestClient/1.0'}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ ISP telemetry successful: {data}")
                    return data
                else:
                    print(f"❌ ISP telemetry failed: HTTP {response.status}")
                    text = await response.text()
                    print(f"   Response: {text}")
                    return None
    except Exception as e:
        print(f"❌ ISP telemetry error: {e}")
        return None

async def test_central_server_telemetry():
    """Test central server telemetry (direct submission)"""
    print("🧪 Testing central server telemetry submission...")
    
    try:
        async with aiohttp.ClientSession() as session:
            # Simulate direct client submission to central server
            async with session.post(
                'https://test.libreqos.com/api/telemetry',
                json=TEST_RESULTS,
                headers={'Content-Type': 'application/json', 'User-Agent': 'TestClient/1.0'},
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Central telemetry successful: {data}")
                    return data
                else:
                    print(f"❌ Central telemetry failed: HTTP {response.status}")
                    text = await response.text()
                    print(f"   Response: {text}")
                    return None
    except Exception as e:
        print(f"❌ Central telemetry error: {e}")
        return None

async def test_isp_forward_simulation():
    """Test ISP server forwarding to central (simulated)"""
    print("🧪 Testing ISP->Central forwarding simulation...")
    
    # Simulate what an ISP server would send to central
    isp_to_central_payload = {
        "telemetry_enabled": True,
        "results": TEST_RESULTS["results"],
        "client_ip": "192.168.1.100",  # Example client IP
        "asn": "AS7922",  # Pre-resolved ASN
        "user_agent": "TestClient/1.0",
        "source_server": "isp"
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                'https://test.libreqos.com/api/telemetry',
                json=isp_to_central_payload,
                headers={'Content-Type': 'application/json'},
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ ISP forwarding successful: {data}")
                    return data
                else:
                    print(f"❌ ISP forwarding failed: HTTP {response.status}")
                    text = await response.text()
                    print(f"   Response: {text}")
                    return None
    except Exception as e:
        print(f"❌ ISP forwarding error: {e}")
        return None

async def test_local_isp_endpoints():
    """Test ISP local telemetry endpoints"""
    print("🧪 Testing ISP local telemetry endpoints...")
    
    endpoints = [
        '/api/telemetry/recent?limit=5',
        '/api/telemetry/stats'
    ]
    
    for endpoint in endpoints:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f'http://localhost:8000{endpoint}') as response:
                    if response.status == 200:
                        data = await response.json()
                        print(f"✅ {endpoint}: {len(str(data))} bytes of data")
                    else:
                        print(f"❌ {endpoint}: HTTP {response.status}")
        except Exception as e:
            print(f"❌ {endpoint}: {e}")

async def main():
    """Run all telemetry tests"""
    print("🧪 Starting dual telemetry system tests...")
    print("=" * 60)
    
    # Test 1: ISP server telemetry (should store locally + forward to central)
    await test_isp_server_telemetry()
    print()
    
    # Test 2: Central server direct submission
    await test_central_server_telemetry()
    print()
    
    # Test 3: ISP forwarding simulation
    await test_isp_forward_simulation()
    print()
    
    # Test 4: Local ISP endpoints
    await test_local_isp_endpoints()
    print()
    
    print("=" * 60)
    print("✅ Dual telemetry tests completed!")
    print()
    print("Expected behavior:")
    print("1. ISP server stores client IP locally for support")
    print("2. ISP server forwards data to central with ASN")
    print("3. Central server stores only ASN (no IP)")
    print("4. Both systems provide statistics and rankings")

if __name__ == "__main__":
    asyncio.run(main())