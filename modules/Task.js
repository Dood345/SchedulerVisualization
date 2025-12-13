export const STATE = {
    READY: 'READY',
    RUNNING: 'RUNNING',
    BLOCKED: 'BLOCKED',
    COMPLETED: 'COMPLETED'
};

export class Task {
    /**
     * @param {string} id Unique Identifier
     * @param {number} period Task Period (P) - also implies Priority for RMS (Lower P = Higher Priority)
     * @param {number} wcet Worst Case Execution Time (Total C)
     * @param {number} offset Release Offset (default 0)
     * @param {Array} instructions List of Operations {type, target/duration}
     */
    constructor(id, period, wcet, offset = 0, instructions = []) {
        this.id = id;
        this.period = parseInt(period);
        this.wcet = parseInt(wcet);
        this.offset = parseInt(offset);
        this.instructions = instructions;

        this.deadline = this.period;
        this.basePriority = this.period; // RMS: Priority = Period (Lower is better)
        this.currentPriority = this.basePriority;

        // Dynamic State
        this.state = STATE.COMPLETED;
        this.pc = 0; // Program Counter (Instruction Index)
        this.currentInstructionRemaining = 0; // Remaining time for COMPUTE op

        this.remainingTotalCost = 0; // Track total WCET progress
        this.nextRelease = this.offset;
        this.absDeadline = 0;

        // Logging/Stats
        this.color = this.getRandomColor();
        this.blockedOn = null; // Resource ID
    }

    reset() {
        this.state = (this.offset === 0) ? STATE.READY : STATE.COMPLETED;
        this.pc = 0;
        this.currentInstructionRemaining = 0;
        this.blockedOn = null;

        this.remainingTotalCost = (this.offset === 0) ? this.wcet : 0;
        this.nextRelease = this.offset;

        if (this.offset === 0) {
            this.absDeadline = this.period;
            this.nextRelease = this.period;
            this.loadInstruction();
        } else {
            this.absDeadline = 0;
        }

        this.currentPriority = this.basePriority;
    }

    checkRelease(time) {
        // If already active, don't re-release
        if (this.state !== STATE.COMPLETED) {
            // Missed Deadline check could go here
            return false;
        }

        if (time === this.nextRelease) {
            this.state = STATE.READY;
            this.pc = 0;
            this.remainingTotalCost = this.wcet;
            this.blockedOn = null;
            this.absDeadline = time + this.period;

            this.loadInstruction();

            this.nextRelease += this.period;
            return true;
        }
        return false;
    }

    loadInstruction() {
        if (this.pc < this.instructions.length) {
            const op = this.instructions[this.pc];
            if (op.type === 'COMPUTE') {
                this.currentInstructionRemaining = op.duration;
            } else {
                this.currentInstructionRemaining = 0; // LOCK/UNLOCK break instantly usually, or 1 tick? Assuming instant logic handling in scheduler
            }
        }
    }

    getRandomColor() {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }
}
