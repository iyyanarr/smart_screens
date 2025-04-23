/**
 * Sub Lot Process Page Styles
 * Contains all the styles for the Sub Lot Process Page
 */
(function() {
    const styles = `
        /* Vibrant color scheme with better text visibility */
        .sub-lot-process-page {
            background: #1E293B;
            color: #FFFFFF;
        }
        
        /* Process Modal Styles */
        .process-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        }
        
        .process-modal.visible {
            opacity: 1;
            pointer-events: all;
        }
        
        .process-modal-content {
            background-color: #1E293B;
            border-radius: 8px;
            box-shadow: 0 5px 25px rgba(0, 0, 0, 0.5);
            width: 90%;
            max-width: 800px;
            max-height: 90vh;
            overflow-y: auto;
            padding: 20px;
            position: relative;
            border: 1px solid #334155;
        }
        
        .process-modal-title {
            font-size: 24px;
            font-weight: bold;
            color: #FFFFFF;
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #334155;
        }
        
        .process-modal-body {
            padding: 20px 0;
        }
        
        .process-steps {
            display: flex;
            flex-direction: column;
            margin-bottom: 30px;
        }
        
        .process-step {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
            opacity: 0.4;
            transition: all 0.3s ease;
        }
        
        .process-step.active {
            opacity: 1;
        }
        
        .process-step.completed .step-icon {
            background-color: #22C55E;
            border-color: #16A34A;
            color: white;
        }
        
        .process-step.current .step-icon {
            background-color: #2563EB;
            border-color: #1D4ED8;
            color: white;
            animation: pulse-blue 1.5s infinite;
        }
        
        .process-step.failed .step-icon {
            background-color: #EF4444;
            border-color: #DC2626;
            color: white;
        }
        
        .step-icon {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background-color: #475569;
            border: 2px solid #64748B;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-right: 15px;
            flex-shrink: 0;
            font-size: 20px;
            color: #F8FAFC;
            transition: all 0.3s ease;
        }
        
        .step-content {
            flex-grow: 1;
        }
        
        .step-title {
            font-weight: bold;
            font-size: 16px;
            color: #F8FAFC;
            margin-bottom: 5px;
        }
        
        .step-description {
            font-size: 14px;
            color: #CBD5E1;
        }
        
        .process-progress-bar {
            height: 6px;
            background-color: #334155;
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 10px;
        }
        
        .progress-bar-fill {
            height: 100%;
            background-color: #2563EB;
            border-radius: 3px;
            transition: width 0.5s ease;
        }
        
        .progress-percentage {
            text-align: right;
            font-size: 14px;
            color: #CBD5E1;
            margin-bottom: 20px;
        }
        
        .process-actions {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin-top: 20px;
            flex-wrap: wrap;
        }
        
        /* Confetti animation for success */
        .confetti-container {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: -1;
            overflow: hidden;
        }
        
        .confetti {
            position: absolute;
            width: 10px;
            height: 10px;
            opacity: 0;
        }
        
        .success-animation {
            text-align: center;
            margin: 30px 0;
        }
        
        .checkmark-circle {
            width: 100px;
            height: 100px;
            position: relative;
            display: inline-block;
            vertical-align: top;
            margin-left: auto;
            margin-right: auto;
        }
        
        .checkmark-circle .background {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: #22C55E;
            position: absolute;
        }
        
        .checkmark-circle .checkmark {
            border-radius: 5px;
        }
        
        .checkmark-circle .checkmark.draw:after {
            animation-delay: 300ms;
            animation-duration: 1s;
            animation-timing-function: ease;
            animation-name: checkmark;
            transform: scaleX(-1) rotate(135deg);
            animation-fill-mode: forwards;
        }
        
        .checkmark-circle .checkmark:after {
            opacity: 0;
            height: 50px;
            width: 25px;
            transform-origin: left top;
            border-right: 10px solid white;
            border-top: 10px solid white;
            border-radius: 2px !important;
            content: '';
            left: 25px;
            top: 50px;
            position: absolute;
        }
        
        @keyframes checkmark {
            0% {
                height: 0;
                width: 0;
                opacity: 1;
            }
            20% {
                height: 0;
                width: 25px;
                opacity: 1;
            }
            40% {
                height: 50px;
                width: 25px;
                opacity: 1;
            }
            100% {
                height: 50px;
                width: 25px;
                opacity: 1;
            }
        }
        
        @keyframes pulse-blue {
            0% {
                box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7);
            }
            70% {
                box-shadow: 0 0 0 10px rgba(37, 99, 235, 0);
            }
            100% {
                box-shadow: 0 0 0 0 rgba(37, 99, 235, 0);
            }
        }
        
        /* Error animation */
        .error-animation {
            text-align: center;
            margin: 30px 0;
        }
        
        .error-circle {
            width: 100px;
            height: 100px;
            position: relative;
            display: inline-block;
            vertical-align: top;
            margin-left: auto;
            margin-right: auto;
        }
        
        .error-circle .background {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: #EF4444;
            position: absolute;
        }
        
        .error-circle .cross {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 60px;
            height: 60px;
            transform: translate(-50%, -50%);
        }
        
        .error-circle .cross:before,
        .error-circle .cross:after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            background-color: white;
            border-radius: 5px;
        }
        
        .error-circle .cross:before {
            width: 10px;
            height: 60px;
            transform: translate(-50%, -50%) rotate(45deg);
        }
        
        .error-circle .cross:after {
            width: 60px;
            height: 10px;
            transform: translate(-50%, -50%) rotate(45deg);
        }
        
        /* Page main layout styles */
        .sub-lot-process-page .section {
            background-color: #fff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            margin-bottom: 20px;
        }
        
        .sub-lot-process-page .section-head {
            padding: 15px;
            background-color: #f1f5f9;
            font-weight: bold;
            color: #334155;
            border-bottom: 1px solid #e2e8f0;
            cursor: pointer;
            position: relative;
        }
        
        .sub-lot-process-page .section-head::after {
            content: "\\f107";
            font-family: FontAwesome;
            position: absolute;
            right: 15px;
            transition: transform 0.2s;
        }
        
        .sub-lot-process-page .section-head.collapsed::after {
            transform: rotate(-90deg);
        }
        
        .sub-lot-process-page .section-body {
            padding: 15px;
        }
        
        .sub-lot-process-page .info-panel {
            padding: 10px;
        }
        
        .sub-lot-process-page .panel-title {
            margin-bottom: 10px;
            font-weight: bold;
            color: #475569;
        }
        
        .sub-lot-process-page .panel-content {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 10px;
            min-height: 100px;
        }
        
        .sub-lot-process-page .info-content {
            line-height: 1.6;
        }
        
        .sub-lot-process-page .operations-grid {
            display: grid;
            grid-template-columns: 1fr 2fr;
            gap: 20px;
        }
        
        .sub-lot-process-page .grid-layout {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        
        .sub-lot-process-page .placeholder-text {
            color: #94a3b8;
            text-align: center;
            padding: 30px 0;
        }
        
        .sub-lot-process-page .combined-info-section .card-body {
            padding: 0.5rem;
        }
        
        .sub-lot-process-page .location-info-container {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .sub-lot-process-page .location-item {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-width: 200px;
            padding: 10px;
            background-color: #f1f5f9;
            border-radius: 4px;
        }
        
        .sub-lot-process-page .defect-option {
            padding: 8px 12px;
            cursor: pointer;
        }
        
        .sub-lot-process-page .defect-option:hover {
            background-color: #f1f5f9;
        }
        
        /* Responsive adjustments */
        @media (max-width: 992px) {
            .sub-lot-process-page .operations-grid {
                grid-template-columns: 1fr;
            }
            
            .sub-lot-process-page .grid-layout {
                grid-template-columns: 1fr;
            }
        }
    `;
    
    // Add styles to the head
    $('<style>').text(styles).appendTo('head');
})();