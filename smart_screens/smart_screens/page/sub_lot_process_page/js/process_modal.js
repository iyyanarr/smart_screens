/**
 * Process Modal Class
 * Handles displaying and managing process modal with steps, animations, and progress tracking
 */
export class ProcessModal {
    /**
     * Create a new ProcessModal instance
     * @param {Object} options - Configuration options for the modal
     * @param {string} options.title - Modal title
     * @param {Array<Object>} options.stages - Array of stage objects, each with name, description
     * @param {Function} options.onComplete - Callback function when process completes successfully
     * @param {Function} options.onCancel - Callback function when user cancels the process
     * @param {Function} options.onError - Callback function when process encounters an error
     */
    constructor(options = {}) {
        this.title = options.title || 'Process Progress';
        this.stages = options.stages || [];
        this.onComplete = options.onComplete || function() {};
        this.onCancel = options.onCancel || function() {};
        this.onError = options.onError || function() {};
        
        this.currentStepIndex = 0;
        this.isVisible = false;
        this.isComplete = false;
        this.isError = false;
        
        // Create the modal elements
        this.createModalElements();
    }
    
    /**
     * Create all the modal DOM elements
     */
    createModalElements() {
        // Create modal container
        this.modalEl = document.createElement('div');
        this.modalEl.className = 'process-modal';
        
        // Create modal content
        this.modalContentEl = document.createElement('div');
        this.modalContentEl.className = 'process-modal-content';
        this.modalEl.appendChild(this.modalContentEl);
        
        // Create modal title
        this.modalTitleEl = document.createElement('div');
        this.modalTitleEl.className = 'process-modal-title';
        this.modalTitleEl.textContent = this.title;
        this.modalContentEl.appendChild(this.modalTitleEl);
        
        // Create modal body
        this.modalBodyEl = document.createElement('div');
        this.modalBodyEl.className = 'process-modal-body';
        this.modalContentEl.appendChild(this.modalBodyEl);
        
        // Create progress container
        this.progressBarEl = document.createElement('div');
        this.progressBarEl.className = 'process-progress-bar';
        this.modalBodyEl.appendChild(this.progressBarEl);
        
        // Create progress fill
        this.progressFillEl = document.createElement('div');
        this.progressFillEl.className = 'progress-bar-fill';
        this.progressFillEl.style.width = '0%';
        this.progressBarEl.appendChild(this.progressFillEl);
        
        // Create percentage text
        this.progressPercentEl = document.createElement('div');
        this.progressPercentEl.className = 'progress-percentage';
        this.progressPercentEl.textContent = '0% Complete';
        this.modalBodyEl.appendChild(this.progressPercentEl);
        
        // Create steps container
        this.stepsEl = document.createElement('div');
        this.stepsEl.className = 'process-steps';
        this.modalBodyEl.appendChild(this.stepsEl);
        
        // Create steps based on the stages array
        this.stepElements = [];
        this.stages.forEach((stage, index) => {
            const stepEl = this.createStepElement(stage, index);
            this.stepsEl.appendChild(stepEl);
            this.stepElements.push(stepEl);
        });
        
        // Create action buttons container
        this.actionsEl = document.createElement('div');
        this.actionsEl.className = 'process-actions';
        this.modalBodyEl.appendChild(this.actionsEl);
        
        // Create cancel button
        this.cancelBtn = document.createElement('button');
        this.cancelBtn.className = 'btn btn-default';
        this.cancelBtn.textContent = 'Cancel';
        this.cancelBtn.onclick = () => this.cancel();
        this.actionsEl.appendChild(this.cancelBtn);
        
        // Create confetti container for success animation
        this.confettiContainer = document.createElement('div');
        this.confettiContainer.className = 'confetti-container';
        this.modalContentEl.appendChild(this.confettiContainer);
        
        // Add modal to document
        document.body.appendChild(this.modalEl);
    }
    
    /**
     * Create a single step element
     * @param {Object} stage - The stage object
     * @param {number} index - Index of the stage
     * @returns {HTMLElement} The step element
     */
    createStepElement(stage, index) {
        const stepEl = document.createElement('div');
        stepEl.className = 'process-step';
        stepEl.setAttribute('data-step', index);
        
        // Icon container
        const iconEl = document.createElement('div');
        iconEl.className = 'step-icon';
        iconEl.textContent = index + 1;
        stepEl.appendChild(iconEl);
        
        // Content container
        const contentEl = document.createElement('div');
        contentEl.className = 'step-content';
        stepEl.appendChild(contentEl);
        
        // Title
        const titleEl = document.createElement('div');
        titleEl.className = 'step-title';
        titleEl.textContent = stage.name || `Step ${index + 1}`;
        contentEl.appendChild(titleEl);
        
        // Description
        const descEl = document.createElement('div');
        descEl.className = 'step-description';
        descEl.textContent = stage.description || '';
        contentEl.appendChild(descEl);
        
        return stepEl;
    }
    
    /**
     * Show the modal
     */
    show() {
        this.isVisible = true;
        this.modalEl.classList.add('visible');
        
        // Activate the first step
        this.updateStep(0);
    }
    
    /**
     * Hide the modal
     */
    hide() {
        this.isVisible = false;
        this.modalEl.classList.remove('visible');
    }
    
    /**
     * Update the current step
     * @param {number} stepIndex - Index of the step to activate
     * @param {string} [status='current'] - Status of the step (current, completed, failed)
     * @param {string} [description] - Optional updated description for the step
     */
    updateStep(stepIndex, status = 'current', description) {
        // Validate step index
        if (stepIndex < 0 || stepIndex >= this.stages.length) {
            console.error('Invalid step index:', stepIndex);
            return;
        }
        
        this.currentStepIndex = stepIndex;
        
        // Update all steps
        this.stepElements.forEach((stepEl, i) => {
            // Remove all status classes
            stepEl.classList.remove('active', 'completed', 'current', 'failed');
            
            if (i < stepIndex) {
                // Previous steps are completed
                stepEl.classList.add('active', 'completed');
            } else if (i === stepIndex) {
                // Current step
                stepEl.classList.add('active');
                stepEl.classList.add(status);
            } else {
                // Future steps
                // Don't add any status class
            }
            
            // Update description if provided
            if (i === stepIndex && description) {
                stepEl.querySelector('.step-description').textContent = description;
            }
        });
        
        // Update progress bar
        const progressPercent = Math.round((stepIndex / (this.stages.length - 1)) * 100);
        this.progressFillEl.style.width = `${progressPercent}%`;
        this.progressPercentEl.textContent = `${progressPercent}% Complete`;
    }
    
    /**
     * Move to the next step
     * @param {string} [description] - Optional updated description for the next step
     */
    nextStep(description) {
        const nextStepIndex = this.currentStepIndex + 1;
        
        if (nextStepIndex < this.stages.length) {
            // Mark current step as completed
            this.updateStep(this.currentStepIndex, 'completed');
            
            // Move to next step
            this.updateStep(nextStepIndex, 'current', description);
            
            // If this is the last step, show the completion screen after a delay
            if (nextStepIndex === this.stages.length - 1) {
                setTimeout(() => {
                    this.complete();
                }, 1000);
            }
        }
    }
    
    /**
     * Show error animation and message
     * @param {string} [errorMessage] - Error message to display
     */
    showError(errorMessage) {
        this.isError = true;
        
        // Update current step to failed
        this.updateStep(this.currentStepIndex, 'failed', errorMessage);
        
        // Remove all except the Cancel button
        this.actionsEl.innerHTML = '';
        this.actionsEl.appendChild(this.cancelBtn);
        
        // Change cancel button text
        this.cancelBtn.textContent = 'Close';
        
        // Add error animation
        const errorAnimationEl = document.createElement('div');
        errorAnimationEl.className = 'error-animation';
        errorAnimationEl.innerHTML = `
            <div class="error-circle">
                <div class="background"></div>
                <div class="cross"></div>
            </div>
            <div class="error-message">${errorMessage || 'An error occurred'}</div>
        `;
        
        // Insert error animation before the actions
        this.modalBodyEl.insertBefore(errorAnimationEl, this.actionsEl);
    }
    
    /**
     * Show completion animation and success message
     */
    complete() {
        this.isComplete = true;
        
        // Mark all steps as completed
        this.stages.forEach((_, index) => {
            this.updateStep(index, 'completed');
        });
        
        // Update progress to 100%
        this.progressFillEl.style.width = '100%';
        this.progressPercentEl.textContent = '100% Complete';
        
        // Change cancel button to close
        this.cancelBtn.textContent = 'Close';
        
        // Add success animation
        const successAnimationEl = document.createElement('div');
        successAnimationEl.className = 'success-animation';
        successAnimationEl.innerHTML = `
            <div class="checkmark-circle">
                <div class="background"></div>
                <div class="checkmark draw"></div>
            </div>
            <div class="success-message">Process Completed Successfully!</div>
        `;
        
        // Add a done button
        const doneBtn = document.createElement('button');
        doneBtn.className = 'btn btn-primary';
        doneBtn.textContent = 'Done';
        doneBtn.onclick = () => {
            this.hide();
            if (typeof this.onComplete === 'function') {
                this.onComplete();
            }
        };
        
        // Insert success animation before the actions
        this.modalBodyEl.insertBefore(successAnimationEl, this.actionsEl);
        
        // Replace all buttons with just the Done button
        this.actionsEl.innerHTML = '';
        this.actionsEl.appendChild(doneBtn);
        
        // Play confetti animation
        this.playConfettiAnimation();
    }
    
    /**
     * Play confetti animation to celebrate completion
     */
    playConfettiAnimation() {
        const confettiCount = 150;
        const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800', '#FF5722'];
        
        // Create confetti pieces
        for (let i = 0; i < confettiCount; i++) {
            this.createConfettiPiece(colors[Math.floor(Math.random() * colors.length)]);
        }
    }
    
    /**
     * Create a single confetti piece with animation
     * @param {string} color - Color of the confetti piece
     */
    createConfettiPiece(color) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.backgroundColor = color;
        
        // Random position, rotation and size
        const x = Math.random() * 100;
        const y = -10;
        const rotation = Math.random() * 360;
        const size = Math.random() * 10 + 5;
        
        // Apply CSS properties
        confetti.style.left = `${x}%`;
        confetti.style.top = `${y}%`;
        confetti.style.width = `${size}px`;
        confetti.style.height = `${size}px`;
        confetti.style.transform = `rotate(${rotation}deg)`;
        
        // Add to container
        this.confettiContainer.appendChild(confetti);
        
        // Animate it
        const animation = confetti.animate(
            [
                { top: `${y}%`, opacity: 1, transform: `rotate(${rotation}deg)` },
                { top: '100%', opacity: 0, transform: `rotate(${rotation + 360 * 3}deg)` }
            ],
            {
                duration: Math.random() * 3000 + 2000,
                easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
            }
        );
        
        // Remove the element when animation completes
        animation.onfinish = () => {
            confetti.remove();
        };
    }
    
    /**
     * Cancel the process
     */
    cancel() {
        this.hide();
        if (typeof this.onCancel === 'function') {
            this.onCancel();
        }
    }
    
    /**
     * Remove the modal from the DOM entirely
     */
    destroy() {
        if (this.modalEl) {
            this.modalEl.remove();
        }
    }
}