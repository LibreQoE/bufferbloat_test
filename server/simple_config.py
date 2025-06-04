"""
Simple Configuration for Multiprocess Virtual Household
Simplified configuration for user type process separation
"""

import os
from dataclasses import dataclass
from typing import Dict, Any

@dataclass
class SimpleMultiprocessConfig:
    """Simple configuration for multiprocess virtual household system"""
    
    # Enable/disable multiprocess mode
    enable_multiprocess: bool = True
    
    # User type process configuration
    user_type_processes: Dict[str, Dict[str, Any]] = None
    
    # Shared state configuration
    shared_state_backend: str = 'multiprocessing'  # No Redis required
    
    # Health monitoring
    health_check_interval: float = 10.0
    process_restart_enabled: bool = True
    process_timeout: float = 30.0
    
    # Performance settings
    update_interval: float = 0.25  # 250ms updates - stable baseline
    cleanup_interval: float = 60.0
    
    # Logging
    log_level: str = 'INFO'
    enable_diagnostic_logging: bool = True
    
    def __post_init__(self):
        if self.user_type_processes is None:
            # ALL SET TO 5 Mbps BIDIRECTIONAL FOR BANDWIDTH CONTENTION TESTING
            # PORT-BASED ROUTING: Each worker runs on dedicated port
            self.user_type_processes = {
                'alex': {
                    'max_users': 30,
                    'memory_limit': '256MB',
                    'target_throughput_mbps': 300,  # 30 × 10 Mbps (5 up + 5 down)
                    'port': 8086,  # Dedicated port for Alex worker
                    'profile': {
                        'name': 'Alex (Flow 1)',
                        'download_mbps': 5.0,
                        'upload_mbps': 5.0,
                        'description': '5 Mbps bidirectional flow',
                        'activity_type': 'contention_test'
                    }
                },
                'sarah': {
                    'max_users': 30,
                    'memory_limit': '256MB',
                    'target_throughput_mbps': 300,  # 30 × 10 Mbps (5 up + 5 down)
                    'port': 8082,  # Dedicated port for Sarah worker
                    'profile': {
                        'name': 'Sarah (Flow 2)',
                        'download_mbps': 5.0,
                        'upload_mbps': 5.0,
                        'description': '5 Mbps bidirectional flow',
                        'activity_type': 'contention_test'
                    }
                },
                'jake': {
                    'max_users': 30,
                    'memory_limit': '256MB',
                    'target_throughput_mbps': 300,  # 30 × 10 Mbps (5 up + 5 down)
                    'port': 8083,  # Dedicated port for Jake worker
                    'profile': {
                        'name': 'Jake (Flow 3)',
                        'download_mbps': 5.0,
                        'upload_mbps': 5.0,
                        'description': '5 Mbps bidirectional flow',
                        'activity_type': 'contention_test'
                    }
                },
                'computer': {
                    'max_users': 30,
                    'memory_limit': '256MB',
                    'target_throughput_mbps': 300,  # 30 × 10 Mbps (5 up + 5 down)
                    'port': 8084,  # Dedicated port for Computer worker
                    'profile': {
                        'name': 'Computer (Flow 4)',
                        'download_mbps': 5.0,
                        'upload_mbps': 5.0,
                        'description': '5 Mbps bidirectional flow',
                        'activity_type': 'contention_test'
                    }
                }
            }
    
    @classmethod
    def from_env(cls) -> 'SimpleMultiprocessConfig':
        """Create configuration from environment variables"""
        return cls(
            enable_multiprocess=os.getenv('VH_ENABLE_MULTIPROCESS', 'true').lower() == 'true',
            health_check_interval=float(os.getenv('VH_HEALTH_CHECK_INTERVAL', 10.0)),
            process_restart_enabled=os.getenv('VH_PROCESS_RESTART', 'true').lower() == 'true',
            log_level=os.getenv('VH_LOG_LEVEL', 'INFO'),
            enable_diagnostic_logging=os.getenv('VH_DIAGNOSTIC_LOGGING', 'true').lower() == 'true'
        )
    
    def get_user_type_config(self, user_type: str) -> Dict[str, Any]:
        """Get configuration for specific user type"""
        if user_type not in self.user_type_processes:
            raise ValueError(f"Unknown user type: {user_type}")
        
        config = self.user_type_processes[user_type].copy()
        config.update({
            'user_type': user_type,
            'update_interval': self.update_interval,
            'log_level': self.log_level,
            'enable_diagnostic_logging': self.enable_diagnostic_logging
        })
        return config
    
    def get_supported_user_types(self) -> list:
        """Get list of supported user types"""
        return list(self.user_type_processes.keys())
    
    def validate(self) -> bool:
        """Validate configuration parameters"""
        if not self.user_type_processes:
            raise ValueError("user_type_processes cannot be empty")
        
        required_user_types = ['alex', 'sarah', 'jake', 'computer']
        for user_type in required_user_types:
            if user_type not in self.user_type_processes:
                raise ValueError(f"Missing required user type: {user_type}")
        
        for user_type, config in self.user_type_processes.items():
            if 'max_users' not in config or config['max_users'] <= 0:
                raise ValueError(f"Invalid max_users for {user_type}")
            
            if 'profile' not in config:
                raise ValueError(f"Missing profile for {user_type}")
        
        return True

# Global configuration instance
simple_config = SimpleMultiprocessConfig.from_env()
simple_config.validate()