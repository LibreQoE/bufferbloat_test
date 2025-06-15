/**
 * Timeline Chart Module
 * Handles the latency chart visualization using Chart.js
 */

// Chart configuration
const CHART_CONFIG = {
    type: 'line',
    data: {
        datasets: [{
            label: 'Latency (ms)',
            data: [],
            borderColor: '#ffffff',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1.5,
            pointRadius: 1, // Consistent size for all points
            pointBackgroundColor: 'rgba(255, 255, 255, 0.8)', // Same color for all points
            pointBorderColor: 'rgba(255, 255, 255, 1)', // Same border for all points
            pointStyle: function(context) {
                // Use circle for all points (no special styling for timeouts)
                return 'circle';
            },
            pointHoverRadius: 3,
            tension: 0.2
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                type: 'linear',
                position: 'bottom',
                title: {
                    display: true,
                    text: 'Time (seconds)',
                    color: '#ffffff'
                },
                min: 0,
                max: 60,
                ticks: {
                    color: '#ffffff',
                    stepSize: 10,
                    maxRotation: 0,
                    autoSkip: true,
                    font: {
                        size: function(context) {
                            return window.innerWidth < 768 ? 10 : 12;
                        }
                    }
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                }
            },
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                title: {
                    display: true,
                    text: 'Latency (ms)',
                    color: '#ffffff'
                },
                min: 0,
                suggestedMax: 1000, // Ensure timeout values (1000ms) are visible
                ticks: {
                    color: '#ffffff',
                    font: {
                        size: function(context) {
                            return window.innerWidth < 768 ? 10 : 12;
                        }
                    },
                    callback: function(value) {
                        // On mobile, simplify large numbers
                        if (window.innerWidth < 768 && value >= 1000) {
                            return (value / 1000) + 'k';
                        }
                        return value;
                    }
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                }
            },
            y1: {
                type: 'linear',
                display: true,
                position: 'right',
                title: {
                    display: true,
                    text: 'Latency (ms)',
                    color: '#ffffff'
                },
                min: 0,
                suggestedMax: 1000, // Ensure timeout values (1000ms) are visible
                ticks: {
                    color: '#ffffff',
                    font: {
                        size: function(context) {
                            return window.innerWidth < 768 ? 10 : 12;
                        }
                    },
                    callback: function(value) {
                        // On mobile, simplify large numbers
                        if (window.innerWidth < 768 && value >= 1000) {
                            return (value / 1000) + 'k';
                        }
                        return value;
                    }
                },
                grid: {
                    drawOnChartArea: false, // Don't draw grid lines for the right axis
                }
            }
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                callbacks: {
                    title: function(tooltipItems) {
                        return `Time: ${tooltipItems[0].parsed.x.toFixed(1)}s`;
                    },
                    label: function(context) {
                        // Format latency value based on size
                        const latency = context.parsed.y;
                        let formattedLatency;
                        
                        if (latency < 10) {
                            formattedLatency = latency.toFixed(1);
                        } else {
                            formattedLatency = Math.round(latency);
                        }
                        
                        // Check if this is a timeout point
                        const dataPoint = context.dataset.data[context.dataIndex];
                        if (dataPoint && dataPoint.isTimeout) {
                            return `Latency: ${formattedLatency} ms (TIMEOUT)`;
                        }
                        
                        return `Latency: ${formattedLatency} ms`;
                    }
                }
            },
            annotation: {
                annotations: {
                    baselineRegion: {
                        type: 'box',
                        xMin: 0,
                        xMax: 4,
                        yMin: 0,
                        yMax: 'max',
                        backgroundColor: 'rgba(52, 152, 219, 0.2)',
                        borderColor: 'rgba(52, 152, 219, 0.4)',
                        borderWidth: 1,
                        drawTime: 'beforeDatasetsDraw',
                        label: {
                            display: true,
                            content: 'Baseline',
                            position: 'start',
                            color: 'rgba(52, 152, 219, 1)',
                            font: {
                                size: window.innerWidth < 768 ? 10 : 12,
                                weight: 'bold'
                            },
                            rotation: window.innerWidth < 768 ? -90 : 0
                        }
                    },
                    downloadWarmupRegion: {
                        type: 'box',
                        xMin: 4,
                        xMax: 11,
                        yMin: 0,
                        yMax: 'max',
                        backgroundColor: 'rgba(169, 223, 191, 0.2)',
                        borderColor: 'rgba(169, 223, 191, 0.4)',
                        borderWidth: 1,
                        drawTime: 'beforeDatasetsDraw',
                        label: {
                            display: true,
                            content: 'DL Warmup',
                            position: 'start',
                            color: 'rgba(169, 223, 191, 1)',
                            font: {
                                size: window.innerWidth < 768 ? 10 : 12,
                                weight: 'bold'
                            },
                            rotation: window.innerWidth < 768 ? -90 : 0
                        }
                    },
                    downloadRegion: {
                        type: 'box',
                        xMin: 11,
                        xMax: 23,
                        yMin: 0,
                        yMax: 'max',
                        backgroundColor: 'rgba(46, 204, 113, 0.2)',
                        borderColor: 'rgba(46, 204, 113, 0.4)',
                        borderWidth: 1,
                        drawTime: 'beforeDatasetsDraw',
                        label: {
                            display: true,
                            content: 'DL Saturation',
                            position: 'start',
                            color: 'rgba(46, 204, 113, 1)',
                            font: {
                                size: window.innerWidth < 768 ? 10 : 12,
                                weight: 'bold'
                            },
                            rotation: window.innerWidth < 768 ? -90 : 0
                        }
                    },
                    uploadWarmupRegion: {
                        type: 'box',
                        xMin: 23,
                        xMax: 36,
                        yMin: 0,
                        yMax: 'max',
                        backgroundColor: 'rgba(245, 183, 177, 0.2)',
                        borderColor: 'rgba(245, 183, 177, 0.4)',
                        borderWidth: 1,
                        drawTime: 'beforeDatasetsDraw',
                        label: {
                            display: true,
                            content: 'UL Warmup',
                            position: 'start',
                            color: 'rgba(245, 183, 177, 1)',
                            font: {
                                size: window.innerWidth < 768 ? 10 : 12,
                                weight: 'bold'
                            },
                            rotation: window.innerWidth < 768 ? -90 : 0
                        }
                    },
                    uploadRegion: {
                        type: 'box',
                        xMin: 36,
                        xMax: 48,
                        yMin: 0,
                        yMax: 'max',
                        backgroundColor: 'rgba(231, 76, 60, 0.2)',
                        borderColor: 'rgba(231, 76, 60, 0.4)',
                        borderWidth: 1,
                        drawTime: 'beforeDatasetsDraw',
                        label: {
                            display: true,
                            content: 'UL Saturation',
                            position: 'start',
                            color: 'rgba(231, 76, 60, 1)',
                            font: {
                                size: window.innerWidth < 768 ? 10 : 12,
                                weight: 'bold'
                            },
                            rotation: window.innerWidth < 768 ? -90 : 0
                        }
                    },
                    bidirectionalRegion: {
                        type: 'box',
                        xMin: 48,
                        xMax: 60,
                        yMin: 0,
                        yMax: 'max',
                        backgroundColor: 'rgba(156, 39, 176, 0.2)',
                        borderColor: 'rgba(156, 39, 176, 0.4)',
                        borderWidth: 1,
                        drawTime: 'beforeDatasetsDraw',
                        label: {
                            display: true,
                            content: 'Bidirectional',
                            position: 'start',
                            color: 'rgba(156, 39, 176, 1)',
                            font: {
                                size: window.innerWidth < 768 ? 10 : 12,
                                weight: 'bold'
                            },
                            rotation: window.innerWidth < 768 ? -90 : 0
                        }
                    }
                }
            }
        }
    }
};

/**
 * Create and initialize the latency chart
 * @param {string} canvasId - The ID of the canvas element
 * @returns {Object} The Chart.js instance
 */
function createLatencyChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas element with ID '${canvasId}' not found`);
        return null;
    }
    
    // Create the chart
    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, CHART_CONFIG);
    
    return chart;
}

/**
 * Reset the chart data
 * @param {Object} chart - The Chart.js instance
 */
function resetChart(chart) {
    if (!chart) return;
    
    chart.data.datasets[0].data = [];
    chart.update();
}

/**
 * Add a data point to the chart
 * @param {Object} chart - The Chart.js instance
 * @param {number} seconds - The time in seconds
 * @param {number} latency - The latency value in ms
 */
function addLatencyDataPoint(chart, seconds, latency, isTimeout = false) {
    if (!chart) return;
    
    // Add data point with different styling for timeout values
    const dataPoint = {
        x: seconds,
        y: latency
    };
    
    // If this is a timeout value, add special styling
    if (isTimeout) {
        // Add a custom property to identify timeout points
        dataPoint.isTimeout = true;
        
        // Adding timeout data point
    }
    
    chart.data.datasets[0].data.push(dataPoint);
    
    // Ensure timeout values are always visible by setting a minimum suggestedMax
    // This ensures the chart scale includes the timeout values
    if (isTimeout || latency > 500) {
        chart.options.scales.y.suggestedMax = Math.max(chart.options.scales.y.suggestedMax || 0, 1000);
    }
    
    // Adjust y-axis scale if needed for non-timeout values
    else {
        const maxLatency = Math.max(...chart.data.datasets[0].data
            .filter(point => !point.isTimeout)
            .map(point => point.y));
        
        if (maxLatency > chart.options.scales.y.suggestedMax) {
            chart.options.scales.y.suggestedMax = Math.ceil(maxLatency / 100) * 100;
        }
    }
    
    chart.update();
}

export { createLatencyChart, resetChart, addLatencyDataPoint };
