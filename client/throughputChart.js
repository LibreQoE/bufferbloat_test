/**
 * Throughput Chart Module
 * Handles visualization of throughput data
 */

/**
 * Create a throughput chart
 * @param {string} canvasId - The ID of the canvas element
 * @returns {Object} The Chart.js instance
 */
function createThroughputChart(canvasId) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                // Dataset 0: In-phase download throughput
                {
                    label: 'Download (Mbps)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHitRadius: 10,
                    pointHoverBackgroundColor: 'rgba(75, 192, 192, 1)',
                    pointHoverBorderColor: 'rgba(220, 220, 220, 1)',
                    pointHoverBorderWidth: 2,
                    tension: 0.1,
                    data: [],
                    yAxisID: 'y', // Explicitly associate with the left y-axis
                    segment: {
                        // Disable interpolation between points with different phases
                        borderColor: ctx => {
                            // Get the current and next data points
                            const i = ctx.p0DataIndex;
                            const points = ctx.chart.data.datasets[ctx.datasetIndex].data;
                            
                            // If this is the last point or either point is null, don't draw a line
                            if (i >= points.length - 1 || points[i].y === null || points[i+1].y === null) {
                                return 'rgba(0, 0, 0, 0)'; // Transparent
                            }
                            
                            return 'rgba(75, 192, 192, 1)'; // Default color
                        }
                    }
                },
                // Dataset 1: In-phase upload throughput
                {
                    label: 'Upload (Mbps)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHitRadius: 10,
                    pointHoverBackgroundColor: 'rgba(255, 99, 132, 1)',
                    pointHoverBorderColor: 'rgba(220, 220, 220, 1)',
                    pointHoverBorderWidth: 2,
                    tension: 0.1,
                    data: [],
                    yAxisID: 'y1', // Explicitly associate with the right y-axis
                    segment: {
                        // Disable interpolation between points with different phases
                        borderColor: ctx => {
                            // Get the current and next data points
                            const i = ctx.p0DataIndex;
                            const points = ctx.chart.data.datasets[ctx.datasetIndex].data;
                            
                            // If this is the last point or either point is null, don't draw a line
                            if (i >= points.length - 1 || points[i].y === null || points[i+1].y === null) {
                                return 'rgba(0, 0, 0, 0)'; // Transparent
                            }
                            
                            return 'rgba(255, 99, 132, 1)'; // Default color
                        }
                    }
                },
                // Dataset 2: Out-of-phase download throughput (hidden and removed from legend)
                {
                    label: 'Out-of-Phase Download',
                    borderColor: 'rgba(255, 0, 0, 1)',
                    backgroundColor: 'rgba(255, 0, 0, 0.2)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    tension: 0.1,
                    data: [],
                    hidden: true, // Hide this dataset
                    showLine: false, // Don't show the line
                    display: false, // Don't include in legend
                    yAxisID: 'y' // Explicitly associate with the left y-axis
                },
                // Dataset 3: Out-of-phase upload throughput (hidden and removed from legend)
                {
                    label: 'Out-of-Phase Upload',
                    borderColor: 'rgba(255, 165, 0, 1)',
                    backgroundColor: 'rgba(255, 165, 0, 0.2)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    tension: 0.1,
                    data: [],
                    hidden: true, // Hide this dataset
                    showLine: false, // Don't show the line
                    display: false, // Don't include in legend
                    yAxisID: 'y1' // Explicitly associate with the right y-axis
                }
            ]
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
                        color: 'white' // Make text white to match web page design
                    },
                    min: 0,
                    max: 60, // Fixed max to match latency chart
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(0);
                        },
                        color: 'white', // Make tick labels white
                        stepSize: 10, // Fixed step size to match latency chart
                        maxRotation: 0,
                        autoSkip: true
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)' // Lighter grid lines
                    }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Download (Mbps)',
                        color: 'white' // Make text white to match web page design
                    },
                    min: 0,
                    suggestedMax: 100, // Start with 100 Mbps and auto-adjust as needed
                    ticks: {
                        color: 'white' // Make tick labels white
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)' // Lighter grid lines
                    }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Upload (Mbps)',
                        color: 'white' // Make text white to match web page design
                    },
                    min: 0,
                    // No fixed suggestedMax - will be set dynamically based on data
                    ticks: {
                        color: 'white' // Make tick labels white
                    },
                    grid: {
                        drawOnChartArea: false,
                        color: 'rgba(255, 255, 255, 0.1)' // Lighter grid lines
                    },
                    // Ensure this axis adapts to the data
                    adapters: {
                        autoSkip: true
                    }
                }
            },
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.parsed.y;
                            return `${label}: ${value.toFixed(2)} Mbps`;
                        }
                    }
                },
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 10,
                        color: 'white', // Make legend text white to match web page design
                        filter: function(legendItem, chartData) {
                            // Only show the first two datasets (Download and Upload)
                            return legendItem.datasetIndex < 2;
                        }
                    }
                },
                annotation: {
                    annotations: {}
                }
            }
        }
    });
    
    return chart;
}

/**
 * Reset the throughput chart
 * @param {Object} chart - The Chart.js instance
 */
function resetThroughputChart(chart) {
    chart.data.datasets.forEach(dataset => {
        dataset.data = [];
    });
    
    // Clear phase annotations
    if (chart.options.plugins.annotation) {
        chart.options.plugins.annotation.annotations = {};
    }
    
    chart.update();
}

/**
 * Update the throughput chart configuration
 * @param {Object} chart - The Chart.js instance
 */
function updateThroughputChart(chart) {
    // Update y-scales based on data, but preserve x-axis settings
    const allDownloadData = [...chart.data.datasets[0].data, ...chart.data.datasets[2].data];
    const allUploadData = [...chart.data.datasets[1].data, ...chart.data.datasets[3].data];
    
    // Ensure x-axis min and max are preserved
    chart.options.scales.x.min = 0;
    chart.options.scales.x.max = 60;
    
    if (allDownloadData.length > 0) {
        const maxDownload = Math.max(...allDownloadData.map(point => point.y || 0));
        
        // Make the download y-axis fully dynamic based on actual data
        // Use a padding factor to ensure there's some space above the highest point
        const paddingFactor = 1.2; // 20% padding
        
        // Set a minimum reasonable value based on the data
        // For very low speeds (< 10 Mbps), use a minimum of 10 Mbps
        // For medium speeds (10-100 Mbps), use a minimum of 20% more than the max
        // For high speeds (> 100 Mbps), use a minimum of 10% more than the max
        let suggestedMax;
        if (maxDownload < 10) {
            suggestedMax = Math.max(10, Math.ceil(maxDownload * 1.5));
        } else if (maxDownload < 100) {
            suggestedMax = Math.ceil(maxDownload * 1.2);
        } else {
            suggestedMax = Math.ceil(maxDownload * 1.1);
        }
        
        // Update the axis with the calculated value
        chart.options.scales.y.suggestedMax = suggestedMax;
        
        // Dynamic download y-axis adjustment
    } else {
        // Default if no data - start with a reasonable minimum
        chart.options.scales.y.suggestedMax = 100;
    }
    
    if (allUploadData.length > 0) {
        const maxUpload = Math.max(...allUploadData.map(point => point.y || 0));
        
        // Make the upload y-axis fully dynamic based on actual data
        // Use a padding factor to ensure there's some space above the highest point
        let paddingFactor;
        
        // For very low speeds (< 5 Mbps), use more padding
        // For higher speeds, use less padding
        if (maxUpload < 5) {
            paddingFactor = 1.5; // 50% padding for low speeds
        } else if (maxUpload < 20) {
            paddingFactor = 1.3; // 30% padding for medium speeds
        } else {
            paddingFactor = 1.2; // 20% padding for high speeds
        }
        
        // Set a minimum reasonable value based on the data
        const suggestedMax = Math.max(Math.ceil(maxUpload * paddingFactor), 1);
        
        // Update the axis with the calculated value
        chart.options.scales.y1.suggestedMax = suggestedMax;
        
        // Dynamic upload y-axis adjustment
    } else {
        // Default if no data - very minimal to start
        chart.options.scales.y1.suggestedMax = 5;
    }
    
    chart.update();
}

/**
 * Add a download throughput data point
 * @param {Object} chart - The Chart.js instance
 * @param {number} seconds - The time in seconds
 * @param {number} throughput - The throughput in Mbps
 * @param {boolean} isOutOfPhase - Whether the traffic is out of phase
 */
function addDownloadThroughputDataPoint(chart, seconds, throughput, isOutOfPhase = false) {
    if (!chart) return;
    
    const datasetIndex = isOutOfPhase ? 2 : 0;
    
    chart.data.datasets[datasetIndex].data.push({
        x: seconds,
        y: throughput
    });
    
    chart.update('none');
}

/**
 * Add an upload throughput data point
 * @param {Object} chart - The Chart.js instance
 * @param {number} seconds - The time in seconds
 * @param {number} throughput - The throughput in Mbps
 * @param {boolean} isOutOfPhase - Whether the traffic is out of phase
 */
function addUploadThroughputDataPoint(chart, seconds, throughput, isOutOfPhase = false) {
    if (!chart) return;
    
    const datasetIndex = isOutOfPhase ? 3 : 1;
    
    chart.data.datasets[datasetIndex].data.push({
        x: seconds,
        y: throughput
    });
    
    chart.update('none');
}

/**
 * Add a null data point for download throughput to create a visual break in the line
 * @param {Object} chart - The Chart.js instance
 * @param {number} seconds - The time in seconds
 */
function addNullDownloadDataPoint(chart, seconds) {
    if (!chart) return;
    
    // Add a zero data point first to create a vertical drop
    chart.data.datasets[0].data.push({
        x: seconds - 0.001, // Slightly before to ensure proper ordering
        y: 0
    });
    
    // Then add a null data point to break the line
    chart.data.datasets[0].data.push({
        x: seconds,
        y: null
    });
    
    // Added download break points
    chart.update('none');
}

/**
 * Add a null data point for upload throughput to create a visual break in the line
 * @param {Object} chart - The Chart.js instance
 * @param {number} seconds - The time in seconds
 */
function addNullUploadDataPoint(chart, seconds) {
    if (!chart) return;
    
    // Add a zero data point first to create a vertical drop
    chart.data.datasets[1].data.push({
        x: seconds - 0.001, // Slightly before to ensure proper ordering
        y: 0
    });
    
    // Then add a null data point to break the line
    chart.data.datasets[1].data.push({
        x: seconds,
        y: null
    });
    
    // Added upload break points
    chart.update('none');
}

/**
 * Add phase transition annotations to the chart
 * @param {Object} chart - The Chart.js instance
 * @param {Array} phaseTransitions - Array of phase transition objects
 */
function addPhaseAnnotations(chart, phaseTransitions) {
    // Clear existing annotations
    if (chart.options.plugins.annotation) {
        chart.options.plugins.annotation.annotations = {};
    } else {
        chart.options.plugins.annotation = {
            annotations: {}
        };
    }
    
    // Add vertical line for each phase transition
    phaseTransitions.forEach((transition, index) => {
        chart.options.plugins.annotation.annotations[`phase${index}`] = {
            type: 'line',
            mode: 'vertical',
            scaleID: 'x',
            value: transition.time,
            borderColor: 'rgba(255, 255, 255, 0.5)',
            borderWidth: 2,
            label: {
                content: `${transition.fromPhase} → ${transition.toPhase}`,
                enabled: true,
                position: 'top',
                color: 'white',
                backgroundColor: 'rgba(0, 0, 0, 0.7)'
            }
        };
    });
    
    chart.update('none');
}

/**
 * Update the throughput chart with all data
 * @param {Object} chart - The Chart.js instance
 * @param {Array} downloadData - Download throughput data
 * @param {Array} uploadData - Upload throughput data
 * @param {Array} phaseTransitions - Array of phase transitions from the phase controller
 */
function updateThroughputChartWithAllData(chart, downloadData, uploadData, phaseTransitions = []) {
    // Clear existing data
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    chart.data.datasets[2].data = [];
    chart.data.datasets[3].data = [];
    
    // Using phase transitions from phase controller
    
    // Add all in-phase download data points with breaks at phase transitions
    const inPhaseDownloadData = downloadData.filter(point => !point.isOutOfPhase);
    addDataPointsWithBreaks(chart, 0, inPhaseDownloadData, phaseTransitions);
    
    // Add all in-phase upload data points with breaks at phase transitions
    const inPhaseUploadData = uploadData.filter(point => !point.isOutOfPhase);
    addDataPointsWithBreaks(chart, 1, inPhaseUploadData, phaseTransitions);
    
    // Add all out-of-phase download data points
    downloadData
        .filter(point => point.isOutOfPhase)
        .forEach(point => {
            chart.data.datasets[2].data.push({
                x: point.time,
                y: point.value
            });
        });
    
    // Add all out-of-phase upload data points
    uploadData
        .filter(point => point.isOutOfPhase)
        .forEach(point => {
            chart.data.datasets[3].data.push({
                x: point.time,
                y: point.value
            });
        });
    
    // Update chart
    updateThroughputChart(chart);
}

/**
 * Add data points with breaks at phase transitions
 * @param {Object} chart - The Chart.js instance
 * @param {number} datasetIndex - The dataset index
 * @param {Array} data - The data points
 * @param {Array} transitions - The phase transitions
 */
function addDataPointsWithBreaks(chart, datasetIndex, data, transitions) {
    if (data.length === 0) return;
    
    // Sort data by time
    const sortedData = [...data].sort((a, b) => a.time - b.time);
    
    // Create a map of transition times for faster lookup
    const transitionTimes = new Map();
    transitions.forEach(t => {
        transitionTimes.set(Math.floor(t.time * 10) / 10, t); // Round to 1 decimal place for comparison
    });
    
    // Add data points with breaks at phase transitions
    let lastAddedTransitionTime = -1; // Track the last transition time we added a break for
    
    for (let i = 0; i < sortedData.length; i++) {
        const point = sortedData[i];
        const pointTimeRounded = Math.floor(point.time * 10) / 10; // Round to 1 decimal place
        
        // Check if we're near a transition and haven't added a break for it yet
        let nearestTransition = null;
        for (const [transitionTime, transition] of transitionTimes.entries()) {
            // Check if this point is just after a transition (within 0.5s)
            if (point.time > transitionTime &&
                point.time - transitionTime < 0.5 &&
                transitionTime > lastAddedTransitionTime) {
                nearestTransition = transition;
                lastAddedTransitionTime = transitionTime;
                break;
            }
        }
        
        // If we found a transition, add a break
        if (nearestTransition) {
            // Add a zero point at the transition time
            chart.data.datasets[datasetIndex].data.push({
                x: nearestTransition.time - 0.001,
                y: 0
            });
            
            // Add a null point at the transition
            chart.data.datasets[datasetIndex].data.push({
                x: nearestTransition.time,
                y: null
            });
            
            // Added break at phase transition
        }
        
        // Add the actual data point
        chart.data.datasets[datasetIndex].data.push({
            x: point.time,
            y: point.value
        });
    }
    
    // Add breaks at any remaining transitions that might be after the last data point
    for (const [transitionTime, transition] of transitionTimes.entries()) {
        if (transitionTime > lastAddedTransitionTime && sortedData.length > 0) {
            const lastPointTime = sortedData[sortedData.length - 1].time;
            
            // Only add breaks for transitions that are after our data but within a reasonable range
            if (transitionTime > lastPointTime && transitionTime - lastPointTime < 5) {
                // Add a zero point at the transition time
                chart.data.datasets[datasetIndex].data.push({
                    x: transition.time - 0.001,
                    y: 0
                });
                
                // Add a null point at the transition
                chart.data.datasets[datasetIndex].data.push({
                    x: transition.time,
                    y: null
                });
                
                // Added break at phase transition after data
            }
        }
    }
}

export {
    createThroughputChart,
    resetThroughputChart,
    updateThroughputChart,
    addDownloadThroughputDataPoint,
    addUploadThroughputDataPoint,
    addNullDownloadDataPoint,
    addNullUploadDataPoint,
    addPhaseAnnotations,
    updateThroughputChartWithAllData
};