/**
 * Celebration Effects Module
 * Handles confetti, sparkles, and other celebration animations
 * Used for excellent grades (A+ and A) across both test modes
 */

import { shouldCelebrate } from './gradeCalculations.js';

/**
 * Initialize celebration effects for excellent grades
 * @param {Object} data - Unified result data
 * @param {string} containerId - Container ID
 */
export function initializeCelebrationEffects(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Trigger celebration for total grade
    if (shouldCelebrate(data.totalGrade.grade)) {
        const totalGradeElement = container.querySelector('.total-grade-box');
        if (totalGradeElement) {
            triggerTotalGradeCelebration(totalGradeElement, data.totalGrade.grade);
        }
    }

    // Trigger celebrations for individual phases
    data.phases.forEach(phase => {
        if (shouldCelebrate(phase.grade)) {
            const phaseElement = container.querySelector(`#${phase.id}Grade`)?.closest('.grade-box');
            if (phaseElement) {
                triggerPhaseCelebration(phaseElement, phase.grade);
            }
        }
    });
}

/**
 * Trigger celebration for total grade
 * @param {HTMLElement} totalGradeElement - Total grade DOM element
 * @param {string} grade - Grade letter
 */
export function triggerTotalGradeCelebration(totalGradeElement, grade) {
    // Add celebration class for confetti and bounce animation
    totalGradeElement.classList.add('celebration');
    
    // Create confetti effect
    createConfettiEffect(totalGradeElement);
    
    // For A+ grades, add extra sparkle effects
    if (grade === 'A+') {
        createSparkleEffect(totalGradeElement);
    }
    
    // Remove celebration class after animation completes
    setTimeout(() => {
        totalGradeElement.classList.remove('celebration');
    }, 3000); // 3 seconds to match confetti animation duration
}

/**
 * Trigger celebration for individual phases
 * @param {HTMLElement} phaseElement - Phase grade DOM element
 * @param {string} grade - Grade letter
 */
export function triggerPhaseCelebration(phaseElement, grade) {
    // Add subtle celebration for individual phases
    phaseElement.classList.add('phase-celebration');
    
    // Create smaller confetti effect
    createConfettiEffect(phaseElement, { 
        particleCount: 30,
        spread: 45,
        duration: 2000
    });
    
    // Remove celebration class after animation
    setTimeout(() => {
        phaseElement.classList.remove('phase-celebration');
    }, 2000);
}

/**
 * Create confetti effect
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Confetti configuration
 */
export function createConfettiEffect(container, options = {}) {
    const defaults = {
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 },
        duration: 3000,
        colors: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3']
    };
    
    const config = { ...defaults, ...options };
    
    // Create confetti particles
    for (let i = 0; i < config.particleCount; i++) {
        setTimeout(() => {
            createConfettiParticle(container, config);
        }, Math.random() * config.duration * 0.3); // Stagger particle creation
    }
}

/**
 * Create individual confetti particle
 * @param {HTMLElement} container - Container element
 * @param {Object} config - Particle configuration
 */
function createConfettiParticle(container, config) {
    const particle = document.createElement('div');
    particle.className = 'confetti-particle';
    
    // Random color from palette
    const color = config.colors[Math.floor(Math.random() * config.colors.length)];
    
    // Random position and animation properties
    const startX = Math.random() * 100;
    const endX = startX + (Math.random() - 0.5) * config.spread;
    const rotation = Math.random() * 360;
    const scale = 0.5 + Math.random() * 0.5;
    
    particle.style.cssText = `
        position: absolute;
        width: 8px;
        height: 8px;
        background: ${color};
        left: ${startX}%;
        top: -10px;
        transform: rotate(${rotation}deg) scale(${scale});
        pointer-events: none;
        z-index: 1000;
        border-radius: 2px;
        animation: confetti-fall ${config.duration}ms ease-out forwards;
        --end-x: ${endX}%;
    `;
    
    container.appendChild(particle);
    
    // Remove particle after animation
    setTimeout(() => {
        if (particle.parentNode) {
            particle.parentNode.removeChild(particle);
        }
    }, config.duration);
}

/**
 * Create sparkle effect for A+ grades
 * @param {HTMLElement} container - Container element
 */
export function createSparkleEffect(container) {
    const sparkleCount = 8;
    
    for (let i = 0; i < sparkleCount; i++) {
        setTimeout(() => {
            const sparkle = document.createElement('div');
            sparkle.className = 'sparkle';
            sparkle.style.cssText = `
                position: absolute;
                width: 4px;
                height: 4px;
                background: radial-gradient(circle, #fff 0%, transparent 70%);
                border-radius: 50%;
                pointer-events: none;
                z-index: 1001;
                left: ${Math.random() * 100}%;
                top: ${Math.random() * 100}%;
                animation: sparkle-twinkle 1.5s ease-out forwards;
            `;
            
            container.appendChild(sparkle);
            
            // Remove sparkle after animation
            setTimeout(() => {
                if (sparkle.parentNode) {
                    sparkle.parentNode.removeChild(sparkle);
                }
            }, 1500);
        }, i * 200); // Stagger sparkle creation
    }
}

/**
 * Clean up all celebration effects
 * @param {string} containerId - Container ID
 */
export function cleanupCelebrationEffects(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Remove all confetti particles
    const particles = container.querySelectorAll('.confetti-particle');
    particles.forEach(particle => particle.remove());
    
    // Remove all sparkles
    const sparkles = container.querySelectorAll('.sparkle');
    sparkles.forEach(sparkle => sparkle.remove());
    
    // Remove celebration classes
    const celebratingElements = container.querySelectorAll('.celebration, .phase-celebration');
    celebratingElements.forEach(element => {
        element.classList.remove('celebration', 'phase-celebration');
    });
}

/**
 * Add celebration CSS animations to the page
 */
export function addCelebrationCSS() {
    // Check if CSS is already added
    if (document.getElementById('celebration-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'celebration-styles';
    style.textContent = `
        /* Celebration bounce animation */
        .celebration {
            animation: celebration-bounce 0.6s ease-in-out;
        }
        
        .phase-celebration {
            animation: phase-bounce 0.4s ease-in-out;
        }
        
        @keyframes celebration-bounce {
            0%, 20%, 53%, 80%, 100% {
                transform: translate3d(0, 0, 0);
            }
            40%, 43% {
                transform: translate3d(0, -15px, 0);
            }
            70% {
                transform: translate3d(0, -7px, 0);
            }
            90% {
                transform: translate3d(0, -2px, 0);
            }
        }
        
        @keyframes phase-bounce {
            0%, 20%, 53%, 80%, 100% {
                transform: translate3d(0, 0, 0);
            }
            40%, 43% {
                transform: translate3d(0, -8px, 0);
            }
            70% {
                transform: translate3d(0, -4px, 0);
            }
        }
        
        /* Confetti particle animation */
        @keyframes confetti-fall {
            0% {
                transform: translateY(-10px) translateX(0) rotate(0deg);
                opacity: 1;
            }
            100% {
                transform: translateY(400px) translateX(var(--end-x, 0%)) rotate(720deg);
                opacity: 0;
            }
        }
        
        /* Sparkle animation */
        @keyframes sparkle-twinkle {
            0%, 100% {
                opacity: 0;
                transform: scale(0);
            }
            50% {
                opacity: 1;
                transform: scale(1);
            }
        }
        
        /* Ensure container has relative positioning for particles */
        .total-grade-box,
        .grade-box {
            position: relative;
            overflow: visible;
        }
    `;
    
    document.head.appendChild(style);
}

// Auto-add CSS when module is imported
addCelebrationCSS();