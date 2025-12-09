import { STATE } from './Task.js';

const CONSTANTS = {
    TICK_WIDTH: 20,
    ROW_HEIGHT: 40,
    HEADER_HEIGHT: 30,
    LABEL_WIDTH: 100
};

export class Renderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
    }

    draw(tasks, history, duration) {
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
            let centerY = y + (CONSTANTS.ROW_HEIGHT / 2);

            // Label
            this.ctx.fillStyle = "#000";
            this.ctx.textAlign = "right";
            this.ctx.fillText(`${task.id} (P${task.basePriority})`, CONSTANTS.LABEL_WIDTH - 10, centerY + 4);
            this.ctx.textAlign = "left";

            // Row Line
            this.ctx.beginPath();
            this.ctx.moveTo(0, y + CONSTANTS.ROW_HEIGHT);
            this.ctx.lineTo(this.canvas.width, y + CONSTANTS.ROW_HEIGHT);
            this.ctx.strokeStyle = "#ccc";
            this.ctx.stroke();

            // Draw Ticks
            history.forEach(tick => {
                let taskState = tick.tasks.find(t => t.id === task.id);
                if (!taskState) return;

                let x = CONSTANTS.LABEL_WIDTH + (tick.time * CONSTANTS.TICK_WIDTH);
                let w = CONSTANTS.TICK_WIDTH - 1;
                let h = 20; // Bar height
                let yBar = centerY - 10;

                if (taskState.state === STATE.RUNNING) {
                    this.ctx.fillStyle = task.color || "#2ecc71"; // Green
                    this.ctx.fillRect(x, yBar, w, h);

                    // Check if critical section (blockedOn is null, but we need to check if holding resource)
                    // History doesn't strictly say if holding resource, but we can infer or add to history.
                    // For now, simple run block.
                } else if (taskState.state === STATE.BLOCKED) {
                    this.ctx.fillStyle = "#e74c3c"; // Red
                    this.ctx.fillRect(x, yBar + 5, w, h - 10); // Thinner
                    if (taskState.blockedOn) {
                        this.ctx.font = "9px Arial";
                        this.ctx.fillStyle = "#fff";
                        this.ctx.fillText(taskState.blockedOn, x + 2, yBar + 12);
                    }
                } else if (taskState.state === STATE.READY) {
                    // Preempted or just ready
                    this.ctx.fillStyle = "#bdc3c7"; // Grey
                    this.ctx.fillRect(x, yBar + 8, w, 4); // Line
                }

                // Prio change indicator?
                if (taskState.prio !== undefined && taskState.prio !== task.basePriority) {
                    // Draw indicator
                    this.ctx.fillStyle = "orange";
                    this.ctx.beginPath();
                    this.ctx.arc(x + w / 2, yBar - 3, 2, 0, 2 * Math.PI);
                    this.ctx.fill();
                }
            });

            // Draw Release/Deadline indicators? 
            // Phase 1 had offsets.
            // Release: arrow up. Deadline: arrow down.
            // Maybe later.
        });
    }
}
