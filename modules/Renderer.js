import { STATE } from './Task.js';

const CONSTANTS = {
    TICK_WIDTH: 50, // Wider for text
    ROW_HEIGHT: 60, // Taller for stack
    HEADER_HEIGHT: 30,
    LABEL_WIDTH: 100
};

export class Renderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.lastHistory = null;
        this.lastTasks = null;

        // Tooltip Overlay
        this.tooltip = document.createElement('div');
        this.tooltip.style.position = 'absolute';
        this.tooltip.style.padding = '8px';
        this.tooltip.style.background = 'rgba(0, 0, 0, 0.8)';
        this.tooltip.style.color = '#fff';
        this.tooltip.style.borderRadius = '4px';
        this.tooltip.style.pointerEvents = 'none';
        this.tooltip.style.display = 'none';
        this.tooltip.style.zIndex = '1000';
        this.tooltip.style.fontFamily = 'monospace';
        document.body.appendChild(this.tooltip);

        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseout', () => { this.tooltip.style.display = 'none'; });
    }

    draw(tasks, history, duration) {
        this.lastTasks = tasks;
        this.lastHistory = history;

        const width = CONSTANTS.LABEL_WIDTH + (duration * CONSTANTS.TICK_WIDTH) + 50;
        const height = CONSTANTS.HEADER_HEIGHT + (tasks.length * CONSTANTS.ROW_HEIGHT) + 50;

        this.canvas.width = width;
        this.canvas.height = height;

        this.ctx.clearRect(0, 0, width, height);

        this.drawGrid(duration, height);
        this.drawTasks(tasks, history);
    }

    drawGrid(duration, height) {
        this.ctx.fillStyle = "#333";
        this.ctx.font = "12px Arial";

        for (let t = 0; t <= duration; t++) {
            let x = CONSTANTS.LABEL_WIDTH + (t * CONSTANTS.TICK_WIDTH);

            // Label
            if (t % 5 === 0) {
                this.ctx.fillText(t, x - 5, 20);
            }

            // Line
            this.ctx.beginPath();
            this.ctx.moveTo(x, CONSTANTS.HEADER_HEIGHT);
            this.ctx.lineTo(x, height);
            this.ctx.strokeStyle = "#eee";
            this.ctx.stroke();
        }
    }

    drawTasks(tasks, history) {
        tasks.forEach((task, index) => {
            let y = CONSTANTS.HEADER_HEIGHT + (index * CONSTANTS.ROW_HEIGHT);

            // Row Label
            this.ctx.fillStyle = "#000";
            this.ctx.textAlign = "right";
            this.ctx.font = "bold 14px Arial";
            this.ctx.fillText(`${task.id}`, CONSTANTS.LABEL_WIDTH - 10, y + CONSTANTS.ROW_HEIGHT / 2);
            this.ctx.font = "12px Arial";
            this.ctx.textAlign = "left";

            // Row Line
            this.ctx.beginPath();
            this.ctx.moveTo(0, y + CONSTANTS.ROW_HEIGHT);
            this.ctx.lineTo(this.canvas.width, y + CONSTANTS.ROW_HEIGHT);
            this.ctx.strokeStyle = "#ccc";
            this.ctx.stroke();

            // Draw Blocks
            history.forEach(tick => {
                let taskState = tick.tasks.find(t => t.id === task.id);
                if (!taskState) return;

                // PREEMPTED/READY: Do not draw
                if (taskState.state === STATE.READY || (taskState.state !== STATE.RUNNING && taskState.state !== STATE.BLOCKED && taskState.state !== STATE.DEADLOCKED)) {
                    return;
                }

                let x = CONSTANTS.LABEL_WIDTH + (tick.time * CONSTANTS.TICK_WIDTH);
                let w = CONSTANTS.TICK_WIDTH; // No gap for continuous look? Or kept spacing? User said "Rectangles".
                // Continuous looks better for time range.
                let h = CONSTANTS.ROW_HEIGHT - 10;
                let yBar = y + 5;

                // Opacity Logic
                this.ctx.globalAlpha = 1.0;
                if (taskState.state === STATE.BLOCKED || taskState.state === STATE.DEADLOCKED) {
                    this.ctx.globalAlpha = 0.4;
                }

                // Fill
                this.ctx.fillStyle = task.color;
                this.ctx.fillRect(x, yBar, w, h);

                // Hatch Pattern for DEADLOCKED
                if (taskState.state === STATE.DEADLOCKED) {
                    this.drawHatchPattern(x, yBar, w, h);
                }

                this.ctx.globalAlpha = 1.0; // Reset

                // Border Logic
                if (taskState.isPriorityBoosted) {
                    // PIP Active: Gold Glow
                    this.ctx.strokeStyle = "gold";
                    this.ctx.lineWidth = 4;
                    this.ctx.strokeRect(x, yBar, w, h);
                } else {
                    // Standard
                    this.ctx.strokeStyle = "#000"; // Thin black
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeRect(x, yBar, w, h);
                }

                // Text Content
                // Stack: Wanted (Top), Held (Bottom)
                const lines = [];
                if (taskState.blockedOn) lines.push(`🔓 ${taskState.blockedOn}`);
                if (taskState.heldResources) {
                    taskState.heldResources.forEach(r => lines.push(`🔒 ${r}`));
                }

                if (lines.length > 0) {
                    // Check width
                    if (CONSTANTS.TICK_WIDTH >= 25) {
                        this.ctx.fillStyle = "#000";
                        this.ctx.font = "10px Arial";
                        this.ctx.textAlign = "center";

                        let lineHeight = 15;
                        let startY = yBar + (h - (lines.length * lineHeight)) / 2 + lineHeight / 2 + 3; // Adjust vertical centering

                        lines.forEach((line, i) => {
                            this.ctx.fillText(line, x + w / 2, startY + (i * lineHeight));
                        });
                    }
                }
            });
        });
    }

    drawHatchPattern(x, y, w, h) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(x, y, w, h);
        this.ctx.clip();

        this.ctx.strokeStyle = "rgba(0,0,0,0.5)";
        this.ctx.lineWidth = 1;

        const spacing = 5;
        for (let i = -h; i < w; i += spacing) {
            this.ctx.moveTo(x + i, y);
            this.ctx.lineTo(x + i + h, y + h);
        }
        this.ctx.stroke();
        this.ctx.restore();
    }

    handleMouseMove(e) {
        if (!this.lastHistory || !this.lastTasks) return;

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Determine Task (Row)
        const row = Math.floor((mouseY - CONSTANTS.HEADER_HEIGHT) / CONSTANTS.ROW_HEIGHT);
        if (row < 0 || row >= this.lastTasks.length) {
            this.tooltip.style.display = 'none';
            return;
        }
        const task = this.lastTasks[row];

        // Determine Time (Col)
        const time = Math.floor((mouseX - CONSTANTS.LABEL_WIDTH) / CONSTANTS.TICK_WIDTH);

        // Find Snapshot
        const snapshot = this.lastHistory.find(h => h.time === time);
        if (!snapshot) {
            this.tooltip.style.display = 'none';
            return;
        }

        const taskState = snapshot.tasks.find(t => t.id === task.id);
        if (!taskState || taskState.state === STATE.READY) {
            this.tooltip.style.display = 'none';
            return;
        }

        // Show Tooltip
        this.tooltip.style.display = 'block';
        this.tooltip.style.left = (e.pageX + 10) + 'px';
        this.tooltip.style.top = (e.pageY + 10) + 'px';

        let content = `<strong>${task.id}</strong><br>`;
        content += `Time: ${time}<br>`;
        content += `State: ${taskState.state}<br>`;
        if (taskState.isPriorityBoosted) content += `<span style="color:gold">Priority Boosted</span><br>`;
        if (taskState.blockedOn) content += `Wanted: ${taskState.blockedOn}<br>`;
        if (taskState.heldResources && taskState.heldResources.length > 0) {
            content += `Held: ${taskState.heldResources.join(', ')}`;
        }

        this.tooltip.innerHTML = content;
    }
}
