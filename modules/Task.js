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
     * @param {number} cost Computation Cost (C)
     * @param {number} offset Release Offset (default 0)
     */
    constructor(id, period, cost, offset = 0) {
        this.id = id;
        this.period = parseInt(period);
        this.cost = parseInt(cost);
        this.offset = parseInt(offset);
        this.deadline = this.period; // Implicit deadline
        this.basePriority = this.period; // RMS: Priority = Period (Lower is better)
        this.currentPriority = this.basePriority;

        // Dynamic State
        this.state = STATE.COMPLETED;
        this.remainingCost = 0;
        this.nextRelease = this.offset;
        this.absDeadline = 0;

        // Logging/Stats
        this.executedInPeriod = 0;
        this.color = this.getRandomColor();

        // Resource Management
        this.resourceRequests = []; // Array of {resId, startAt, duration}
        this.blockedOn = null; // Resource ID
    }

    addResourceRequest(resId, startAt, duration) {
        this.resourceRequests.push({ resId, startAt, duration });
    }

    reset() {
        this.state = (this.offset === 0) ? STATE.READY : STATE.COMPLETED;
        this.remainingCost = (this.offset === 0) ? this.cost : 0;
        this.nextRelease = this.offset;
        if (this.offset === 0) {
            this.absDeadline = this.period;
            this.nextRelease = this.period;
        } else {
            this.absDeadline = 0;
        }
        this.currentPriority = this.basePriority;
        this.executedInPeriod = 0;
    }

    checkRelease(time) {
        if (time >= this.nextRelease && (time - this.offset) % this.period === 0) {
            // It's release time. 
            // Note: If offset=0, time=0 is release. time=20 is release (if p=20).
            // Simpler check:
        }

        // Exact release check:
        // First release at `offset`. Subsequent at `offset + k * period`.
        if (time === this.nextRelease) {
            this.state = STATE.READY;
            this.remainingCost = this.cost;
            this.executedInPeriod = 0;
            this.absDeadline = time + this.period;
            this.nextRelease += this.period;
            return true;
        }
        return false;
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
