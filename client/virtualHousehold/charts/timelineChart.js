/**
 * Timeline Chart for Virtual Household Mode
 * Real-time visualization of latency, jitter, and packet loss for all users
 */

class TimelineChart {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            width: 800,
            height: 300,
            duration: 30000, // 30 seconds
            updateInterval: 100, // Update every 100ms
            maxLatency: 500, // Max latency for Y-axis
            ...options
        };
        
        this.users = options.users || {};
        this.data = new Map();
        this.isActive = false;
        this.startTime = null;
        this.canvas = null;
        this.ctx = null;
        this.animationFrame = null;
        
        // Chart styling
        this.style = {
            background: '#1a1a1a',
            grid: '#333',
            text: '#ccc',
            axis: '#666',
            lineWidth: 2,
            pointRadius: 3,
            font: '12px Arial'
        };
        
        // Initialize chart
        this.init();
        
        // Bind event handlers
        this.handleLatencyMeasurement = this.handleLatencyMeasurement.bind(this);
        this.animate = this.animate.bind(this);
        
        // Set up event listeners
        this.setupEventListeners();
    }
    
    init() {
        // Create canvas element
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.options.width;
        this.canvas.height = this.options.height;
        this.canvas.style.width = '100%';
        this.canvas.style.height = 'auto';
        this.canvas.style.maxWidth = `${this.options.width}px`;
        this.canvas.style.background = this.style.background;
        this.canvas.style.borderRadius = '8px';
        
        // Get 2D context
        this.ctx = this.canvas.getContext('2d');
        
        // Set up high DPI support
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        
        // Clear container and add canvas
        this.container.innerHTML = '';
        this.container.appendChild(this.canvas);
        
        // Initialize data storage for each user
        for (const userId of Object.keys(this.users)) {
            this.data.set(userId, {
                latency: [],
                jitter: [],
                loss: [],
                lastUpdate: 0
            });
        }
        
        // Draw initial chart
        this.draw();
        
        console.log('📊 Timeline chart initialized');
    }
    
    setupEventListeners() {
        // Listen for latency measurements
        window.addEventListener('latency-measurement', this.handleLatencyMeasurement);
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }
    
    handleLatencyMeasurement(event) {
        const { userId, latency, jitter, loss, timestamp } = event.detail;
        
        if (!this.isActive || !this.data.has(userId)) return;
        
        const userData = this.data.get(userId);
        const relativeTime = timestamp - (this.startTime || timestamp);
        
        // Add new data points
        userData.latency.push({ time: relativeTime, value: latency });
        userData.jitter.push({ time: relativeTime, value: jitter });
        userData.loss.push({ time: relativeTime, value: loss });
        userData.lastUpdate = timestamp;
        
        // Trim old data (keep only last 30 seconds)
        const cutoff = relativeTime - this.options.duration;
        userData.latency = userData.latency.filter(point => point.time >= cutoff);
        userData.jitter = userData.jitter.filter(point => point.time >= cutoff);
        userData.loss = userData.loss.filter(point => point.time >= cutoff);
    }
    
    start() {
        if (this.isActive) return;
        
        this.isActive = true;
        this.startTime = performance.now();
        
        // Start animation loop
        this.animate();
        
        console.log('▶️ Timeline chart started');
    }
    
    stop() {
        if (!this.isActive) return;
        
        this.isActive = false;
        
        // Stop animation loop
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        
        console.log('⏹️ Timeline chart stopped');
    }
    
    animate() {
        if (!this.isActive) return;
        
        this.draw();
        this.animationFrame = requestAnimationFrame(this.animate);
    }
    
    draw() {
        const { width, height } = this.canvas;
        const ctx = this.ctx;
        
        // Clear canvas
        ctx.fillStyle = this.style.background;
        ctx.fillRect(0, 0, width, height);
        
        // Set up chart dimensions
        const margin = { top: 20, right: 80, bottom: 40, left: 60 };
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;
        
        // Draw grid and axes
        this.drawGrid(ctx, margin, chartWidth, chartHeight);
        this.drawAxes(ctx, margin, chartWidth, chartHeight);
        
        // Draw data lines for each user
        for (const [userId, userData] of this.data) {
            const user = this.users[userId];
            if (!user) continue;
            
            this.drawUserData(ctx, margin, chartWidth, chartHeight, userId, userData, user);
        }
        
        // Draw legend
        this.drawLegend(ctx, margin, chartWidth, chartHeight);
        
        // Draw current time indicator
        this.drawTimeIndicator(ctx, margin, chartWidth, chartHeight);
    }
    
    drawGrid(ctx, margin, chartWidth, chartHeight) {
        ctx.strokeStyle = this.style.grid;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        
        // Vertical grid lines (time)
        const timeSteps = 6; // 5-second intervals
        for (let i = 0; i <= timeSteps; i++) {
            const x = margin.left + (i / timeSteps) * chartWidth;
            ctx.beginPath();
            ctx.moveTo(x, margin.top);
            ctx.lineTo(x, margin.top + chartHeight);
            ctx.stroke();
        }
        
        // Horizontal grid lines (latency)
        const latencySteps = 5;
        for (let i = 0; i <= latencySteps; i++) {
            const y = margin.top + (i / latencySteps) * chartHeight;
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + chartWidth, y);
            ctx.stroke();
        }
        
        ctx.setLineDash([]);
    }
    
    drawAxes(ctx, margin, chartWidth, chartHeight) {
        ctx.strokeStyle = this.style.axis;
        ctx.fillStyle = this.style.text;
        ctx.font = this.style.font;
        ctx.lineWidth = 1;
        
        // X-axis (time)
        ctx.beginPath();
        ctx.moveTo(margin.left, margin.top + chartHeight);
        ctx.lineTo(margin.left + chartWidth, margin.top + chartHeight);
        ctx.stroke();
        
        // Y-axis (latency)
        ctx.beginPath();
        ctx.moveTo(margin.left, margin.top);
        ctx.lineTo(margin.left, margin.top + chartHeight);
        ctx.stroke();
        
        // X-axis labels (time in seconds)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const timeSteps = 6;
        for (let i = 0; i <= timeSteps; i++) {
            const x = margin.left + (i / timeSteps) * chartWidth;
            const seconds = (i * this.options.duration / timeSteps / 1000).toFixed(0);
            ctx.fillText(`${seconds}s`, x, margin.top + chartHeight + 5);
        }
        
        // Y-axis labels (latency in ms)
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const latencySteps = 5;
        for (let i = 0; i <= latencySteps; i++) {
            const y = margin.top + chartHeight - (i / latencySteps) * chartHeight;
            const latency = (i * this.options.maxLatency / latencySteps).toFixed(0);
            ctx.fillText(`${latency}ms`, margin.left - 5, y);
        }
        
        // Axis titles
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Time', margin.left + chartWidth / 2, this.canvas.height - 5);
        
        ctx.save();
        ctx.translate(15, margin.top + chartHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Latency (ms)', 0, 0);
        ctx.restore();
    }
    
    drawUserData(ctx, margin, chartWidth, chartHeight, userId, userData, user) {
        if (userData.latency.length < 2) return;
        
        ctx.strokeStyle = user.color;
        ctx.fillStyle = user.color;
        ctx.lineWidth = this.style.lineWidth;
        
        // Draw latency line
        ctx.beginPath();
        let firstPoint = true;
        
        for (const point of userData.latency) {
            const x = margin.left + (point.time / this.options.duration) * chartWidth;
            const y = margin.top + chartHeight - (point.value / this.options.maxLatency) * chartHeight;
            
            if (firstPoint) {
                ctx.moveTo(x, y);
                firstPoint = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Draw latest point
        if (userData.latency.length > 0) {
            const lastPoint = userData.latency[userData.latency.length - 1];
            const x = margin.left + (lastPoint.time / this.options.duration) * chartWidth;
            const y = margin.top + chartHeight - (lastPoint.value / this.options.maxLatency) * chartHeight;
            
            ctx.beginPath();
            ctx.arc(x, y, this.style.pointRadius, 0, 2 * Math.PI);
            ctx.fill();
        }
        
        // Draw threshold line
        const threshold = user.thresholds.latency;
        const thresholdY = margin.top + chartHeight - (threshold / this.options.maxLatency) * chartHeight;
        
        ctx.strokeStyle = user.color;
        ctx.globalAlpha = 0.3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(margin.left, thresholdY);
        ctx.lineTo(margin.left + chartWidth, thresholdY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }
    
    drawLegend(ctx, margin, chartWidth, chartHeight) {
        const legendX = margin.left + chartWidth + 10;
        let legendY = margin.top;
        
        ctx.font = this.style.font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        for (const [userId, user] of Object.entries(this.users)) {
            // Draw color indicator
            ctx.fillStyle = user.color;
            ctx.fillRect(legendX, legendY - 4, 12, 8);
            
            // Draw user name
            ctx.fillStyle = this.style.text;
            ctx.fillText(`${user.icon} ${user.name}`, legendX + 18, legendY);
            
            // Draw latest latency value
            const userData = this.data.get(userId);
            if (userData && userData.latency.length > 0) {
                const latestLatency = userData.latency[userData.latency.length - 1].value;
                ctx.fillStyle = this.style.text;
                ctx.fillText(`${Math.round(latestLatency)}ms`, legendX + 18, legendY + 12);
            }
            
            legendY += 35;
        }
    }
    
    drawTimeIndicator(ctx, margin, chartWidth, chartHeight) {
        if (!this.isActive || !this.startTime) return;
        
        const elapsed = performance.now() - this.startTime;
        const progress = Math.min(elapsed / this.options.duration, 1);
        const x = margin.left + progress * chartWidth;
        
        // Draw current time line
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.setLineDash([]);
        
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, margin.top + chartHeight);
        ctx.stroke();
        
        ctx.globalAlpha = 1;
    }
    
    handleResize() {
        // Debounce resize events
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
            this.init();
        }, 250);
    }
    
    update() {
        // This method is called by the UI manager for manual updates
        if (!this.isActive) return;
        
        this.draw();
    }
    
    reset() {
        console.log('🔄 Resetting timeline chart');
        
        // Clear all data
        for (const userData of this.data.values()) {
            userData.latency = [];
            userData.jitter = [];
            userData.loss = [];
            userData.lastUpdate = 0;
        }
        
        // Reset timing
        this.startTime = null;
        
        // Redraw empty chart
        this.draw();
        
        console.log('✅ Timeline chart reset');
    }
    
    exportData() {
        const exportData = {
            timestamp: new Date().toISOString(),
            duration: this.options.duration,
            users: {}
        };
        
        for (const [userId, userData] of this.data) {
            exportData.users[userId] = {
                latency: [...userData.latency],
                jitter: [...userData.jitter],
                loss: [...userData.loss],
                lastUpdate: userData.lastUpdate
            };
        }
        
        return exportData;
    }
    
    // Save chart as image
    saveAsImage(filename = 'household-timeline.png') {
        const link = document.createElement('a');
        link.download = filename;
        link.href = this.canvas.toDataURL();
        link.click();
    }
    
    // Get chart statistics
    getStatistics() {
        const stats = {};
        
        for (const [userId, userData] of this.data) {
            if (userData.latency.length === 0) continue;
            
            const latencies = userData.latency.map(p => p.value);
            const jitters = userData.jitter.map(p => p.value);
            const losses = userData.loss.map(p => p.value);
            
            stats[userId] = {
                latency: {
                    min: Math.min(...latencies),
                    max: Math.max(...latencies),
                    avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
                    count: latencies.length
                },
                jitter: {
                    min: Math.min(...jitters),
                    max: Math.max(...jitters),
                    avg: jitters.reduce((a, b) => a + b, 0) / jitters.length,
                    count: jitters.length
                },
                loss: {
                    min: Math.min(...losses),
                    max: Math.max(...losses),
                    avg: losses.reduce((a, b) => a + b, 0) / losses.length,
                    count: losses.length
                }
            };
        }
        
        return stats;
    }
    
    // Cleanup
    destroy() {
        // Stop animation
        this.stop();
        
        // Remove event listeners
        window.removeEventListener('latency-measurement', this.handleLatencyMeasurement);
        window.removeEventListener('resize', this.handleResize);
        
        // Clear timers
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
        
        // Clear container
        if (this.container) {
            this.container.innerHTML = '';
        }
        
        // Clear data
        this.data.clear();
        
        console.log('🗑️ Timeline chart destroyed');
    }
}

export default TimelineChart;