/**
 * Xoshiro128+ PRNG Implementation
 * Fast, high-quality pseudorandom number generator
 * Perfect for generating test data without browser crypto API limitations
 */

import { logWithLevel } from './config.js';

class Xoshiro128Plus {
    constructor(seed = Date.now()) {
        // Initialize state with seed
        this.state = new Uint32Array(4);
        this.setSeed(seed);
    }
    
    /**
     * Set the seed for the PRNG
     * @param {number} seed - Seed value
     */
    setSeed(seed) {
        // Simple seed expansion using splitmix32
        let s = seed >>> 0;
        
        for (let i = 0; i < 4; i++) {
            s = (s + 0x9e3779b9) >>> 0;
            let z = s;
            z = (z ^ (z >>> 16)) >>> 0;
            z = Math.imul(z, 0x85ebca6b) >>> 0;
            z = (z ^ (z >>> 13)) >>> 0;
            z = Math.imul(z, 0xc2b2ae35) >>> 0;
            z = (z ^ (z >>> 16)) >>> 0;
            this.state[i] = z;
        }
        
        // Ensure no zero state
        if (this.state[0] === 0 && this.state[1] === 0 && this.state[2] === 0 && this.state[3] === 0) {
            this.state[0] = 1;
        }
    }
    
    /**
     * Generate next 32-bit random number
     * @returns {number} Random 32-bit unsigned integer
     */
    next() {
        const result = (this.state[0] + this.state[3]) >>> 0;
        
        const t = (this.state[1] << 9) >>> 0;
        
        this.state[2] ^= this.state[0];
        this.state[3] ^= this.state[1];
        this.state[1] ^= this.state[2];
        this.state[0] ^= this.state[3];
        
        this.state[2] ^= t;
        this.state[3] = ((this.state[3] << 11) | (this.state[3] >>> 21)) >>> 0;
        
        return result;
    }
    
    /**
     * Generate random bytes into a Uint8Array
     * @param {Uint8Array} array - Target array to fill
     */
    fillBytes(array) {
        const length = array.length;
        let i = 0;
        
        // Fill 4 bytes at a time for efficiency
        while (i + 3 < length) {
            const value = this.next();
            array[i] = value & 0xFF;
            array[i + 1] = (value >>> 8) & 0xFF;
            array[i + 2] = (value >>> 16) & 0xFF;
            array[i + 3] = (value >>> 24) & 0xFF;
            i += 4;
        }
        
        // Fill remaining bytes
        if (i < length) {
            const value = this.next();
            for (let j = 0; i < length; i++, j++) {
                array[i] = (value >>> (j * 8)) & 0xFF;
            }
        }
    }
    
    /**
     * Generate a Uint8Array of random data
     * @param {number} size - Size in bytes
     * @returns {Uint8Array} Random data
     */
    generateBytes(size) {
        const array = new Uint8Array(size);
        this.fillBytes(array);
        return array;
    }
}

// Global instance for consistent seeding across the application
let globalXoshiro = null;

// Pre-allocated data pools for performance optimization
let dataPool = {
    small: [], // Pool of 64KB chunks
    medium: [], // Pool of 128KB chunks
    large: [], // Pool of 256KB chunks
    xlarge: [], // Pool of 1MB chunks
    xxlarge: [], // Pool of 4MB chunks
    ultra: [], // Pool of 8MB chunks
    maxPoolSize: 5 // Reduced for larger chunks to manage memory
};

// Chunk size constants
const CHUNK_SIZES = {
    SMALL: 64 * 1024,     // 64KB
    MEDIUM: 128 * 1024,   // 128KB
    LARGE: 256 * 1024,    // 256KB
    XLARGE: 1024 * 1024,  // 1MB
    XXLARGE: 4096 * 1024, // 4MB
    ULTRA: 8192 * 1024    // 8MB
};

/**
 * Get or create the global xoshiro instance
 * @returns {Xoshiro128Plus} Global xoshiro instance
 */
function getGlobalXoshiro() {
    if (!globalXoshiro) {
        // Use a combination of timestamp and performance.now() for better entropy
        const seed = (Date.now() * 1000 + Math.floor(performance.now() * 1000)) >>> 0;
        globalXoshiro = new Xoshiro128Plus(seed);
    }
    return globalXoshiro;
}

/**
 * Generate random test data using xoshiro PRNG
 * @param {number} size - Size in bytes
 * @returns {Uint8Array} Random test data
 */
export function generateTestData(size) {
    return getGlobalXoshiro().generateBytes(size);
}

/**
 * Fill an existing array with random data
 * @param {Uint8Array} array - Array to fill
 */
export function fillTestData(array) {
    getGlobalXoshiro().fillBytes(array);
}

/**
 * Reset the global PRNG with a new seed
 * @param {number} seed - Optional seed (uses timestamp if not provided)
 */
export function resetSeed(seed) {
    if (!seed) {
        seed = (Date.now() * 1000 + Math.floor(performance.now() * 1000)) >>> 0;
    }
    globalXoshiro = new Xoshiro128Plus(seed);
}

/**
 * Initialize the global PRNG with a cryptographically secure seed
 * This function is used by saturation.js for secure seeding
 */
export function initWithCryptoSeed() {
    try {
        // Use crypto.getRandomValues for cryptographically secure seeding
        const seedArray = new Uint32Array(1);
        crypto.getRandomValues(seedArray);
        const seed = seedArray[0];
        
        console.log('Initializing xoshiro PRNG with cryptographically secure seed');
        globalXoshiro = new Xoshiro128Plus(seed);
    } catch (error) {
        console.warn('Failed to get cryptographically secure seed, falling back to timestamp:', error);
        // Fallback to timestamp-based seeding
        const seed = (Date.now() * 1000 + Math.floor(performance.now() * 1000)) >>> 0;
        globalXoshiro = new Xoshiro128Plus(seed);
    }
}

/**
 * Fill an existing Uint8Array with random bytes using the global PRNG
 * This function is used by saturation.js for efficient data generation
 * @param {Uint8Array} array - The array to fill with random data
 */
export function fillRandomBytes(array) {
    if (!array || !(array instanceof Uint8Array)) {
        throw new Error('fillRandomBytes requires a Uint8Array parameter');
    }
    
    try {
        getGlobalXoshiro().fillBytes(array);
    } catch (error) {
        console.error('Failed to fill array with xoshiro PRNG:', error);
        
        // Fallback to crypto API with chunking for large arrays
        const maxCryptoChunk = 65536; // 64KB - Firefox's crypto.getRandomValues() limit
        
        if (array.length <= maxCryptoChunk) {
            // Small enough for single crypto call
            crypto.getRandomValues(array);
        } else {
            // Large array: fill in chunks
            let offset = 0;
            while (offset < array.length) {
                const remainingSize = array.length - offset;
                const chunkSize = Math.min(maxCryptoChunk, remainingSize);
                const chunk = array.subarray(offset, offset + chunkSize);
                
                crypto.getRandomValues(chunk);
                offset += chunkSize;
            }
        }
    }
}

/**
 * Get a pre-generated data chunk from the pool or create a new one
 * This optimizes performance by reusing previously generated data
 * @param {number} size - Size of data chunk needed
 * @returns {Uint8Array} Data chunk of the requested size
 */
export function getPooledTestData(size) {
    let pool;
    let poolKey;
    
    // Determine which pool to use based on size
    if (size <= CHUNK_SIZES.SMALL) {
        pool = dataPool.small;
        poolKey = 'small';
        size = CHUNK_SIZES.SMALL; // Standardize to pool size
    } else if (size <= CHUNK_SIZES.MEDIUM) {
        pool = dataPool.medium;
        poolKey = 'medium';
        size = CHUNK_SIZES.MEDIUM; // Standardize to pool size
    } else if (size <= CHUNK_SIZES.LARGE) {
        pool = dataPool.large;
        poolKey = 'large';
        size = CHUNK_SIZES.LARGE; // Standardize to pool size
    } else if (size <= CHUNK_SIZES.XLARGE) {
        pool = dataPool.xlarge;
        poolKey = 'xlarge';
        size = CHUNK_SIZES.XLARGE; // Standardize to pool size
    } else if (size <= CHUNK_SIZES.XXLARGE) {
        pool = dataPool.xxlarge;
        poolKey = 'xxlarge';
        size = CHUNK_SIZES.XXLARGE; // Standardize to pool size
    } else if (size <= CHUNK_SIZES.ULTRA) {
        pool = dataPool.ultra;
        poolKey = 'ultra';
        size = CHUNK_SIZES.ULTRA; // Standardize to pool size
    } else {
        // Size too large for pooling, generate directly
        console.log(`Generating ultra-large data chunk (${(size/1024/1024).toFixed(1)}MB) - exceeds maximum pool size`);
        return generateTestData(size);
    }
    
    // Try to get from pool first
    if (pool.length > 0) {
        const chunk = pool.pop();
        logWithLevel('DEBUG', `Reusing ${poolKey} chunk from pool (${pool.length} remaining)`);
        
        // Return a copy to avoid modifying the original
        return new Uint8Array(chunk.slice(0, size));
    }
    
    // Pool is empty, generate new chunk
    logWithLevel('DEBUG', `Generating new ${poolKey} chunk (pool empty)`);
    const chunk = generateTestData(size);
    
    // Optionally add a copy back to the pool for future use
    if (pool.length < dataPool.maxPoolSize) {
        pool.push(new Uint8Array(chunk));
        logWithLevel('DEBUG', `Added ${poolKey} chunk to pool (${pool.length}/${dataPool.maxPoolSize})`);
    }
    
    return chunk;
}

/**
 * Pre-populate the data pools for better performance
 * Call this during application initialization
 */
export function initializeDataPools() {
    console.log('Initializing xoshiro data pools for optimal performance...');
    
    // Pre-generate chunks for each pool
    const poolTypes = [
        { pool: dataPool.small, size: CHUNK_SIZES.SMALL, name: 'small' },
        { pool: dataPool.medium, size: CHUNK_SIZES.MEDIUM, name: 'medium' },
        { pool: dataPool.large, size: CHUNK_SIZES.LARGE, name: 'large' },
        { pool: dataPool.xlarge, size: CHUNK_SIZES.XLARGE, name: 'xlarge' },
        { pool: dataPool.xxlarge, size: CHUNK_SIZES.XXLARGE, name: 'xxlarge' },
        { pool: dataPool.ultra, size: CHUNK_SIZES.ULTRA, name: 'ultra' }
    ];
    
    poolTypes.forEach(({ pool, size, name }) => {
        // Use fewer chunks for larger sizes to manage memory usage
        let targetCount;
        if (size >= CHUNK_SIZES.ULTRA) {
            targetCount = 1; // Only 1 ultra chunk (8MB each)
        } else if (size >= CHUNK_SIZES.XLARGE) {
            targetCount = 2; // 2 chunks for 1MB+ sizes
        } else {
            targetCount = Math.min(3, dataPool.maxPoolSize); // 3 chunks for smaller sizes
        }
        
        for (let i = 0; i < targetCount; i++) {
            const chunk = generateTestData(size);
            pool.push(chunk);
        }
        
        const sizeDisplay = size >= 1024 * 1024 ? `${(size/1024/1024)}MB` : `${(size/1024)}KB`;
        console.log(`Pre-generated ${targetCount} ${name} chunks (${sizeDisplay} each)`);
    });
    
    console.log('Data pool initialization complete');
}

/**
 * Clear all data pools to free memory
 * Call this when pools are no longer needed
 */
export function clearDataPools() {
    console.log('Clearing xoshiro data pools...');
    
    const totalChunks = dataPool.small.length + dataPool.medium.length + dataPool.large.length +
                       dataPool.xlarge.length + dataPool.xxlarge.length + dataPool.ultra.length;
    
    dataPool.small.length = 0;
    dataPool.medium.length = 0;
    dataPool.large.length = 0;
    dataPool.xlarge.length = 0;
    dataPool.xxlarge.length = 0;
    dataPool.ultra.length = 0;
    
    console.log(`Cleared ${totalChunks} chunks from data pools`);
}

/**
 * Get statistics about current pool usage
 * @returns {Object} Pool statistics
 */
export function getPoolStats() {
    return {
        small: {
            count: dataPool.small.length,
            size: CHUNK_SIZES.SMALL,
            totalMemory: dataPool.small.length * CHUNK_SIZES.SMALL
        },
        medium: {
            count: dataPool.medium.length,
            size: CHUNK_SIZES.MEDIUM,
            totalMemory: dataPool.medium.length * CHUNK_SIZES.MEDIUM
        },
        large: {
            count: dataPool.large.length,
            size: CHUNK_SIZES.LARGE,
            totalMemory: dataPool.large.length * CHUNK_SIZES.LARGE
        },
        xlarge: {
            count: dataPool.xlarge.length,
            size: CHUNK_SIZES.XLARGE,
            totalMemory: dataPool.xlarge.length * CHUNK_SIZES.XLARGE
        },
        xxlarge: {
            count: dataPool.xxlarge.length,
            size: CHUNK_SIZES.XXLARGE,
            totalMemory: dataPool.xxlarge.length * CHUNK_SIZES.XXLARGE
        },
        ultra: {
            count: dataPool.ultra.length,
            size: CHUNK_SIZES.ULTRA,
            totalMemory: dataPool.ultra.length * CHUNK_SIZES.ULTRA
        },
        maxPoolSize: dataPool.maxPoolSize
    };
}

export default Xoshiro128Plus;