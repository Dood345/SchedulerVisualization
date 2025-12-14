export const STATE = {
    READY: 'READY',
    RUNNING: 'RUNNING',
    BLOCKED: 'BLOCKED',
    COMPLETED: 'COMPLETED',
    DEADLOCKED: 'DEADLOCKED'
};

export class Task {
    constructor(id, period, wcet, offset, segments = []) {
        this.id = id;
        this.period = period;
        this.wcet = wcet;
        this.offset = offset;

        // Data Model: Segments
        // Example: [{ duration: 5, resources: ['R1'] }]
        this.segments = segments;

        // Runtime State
        this.currentSegmentIndex = 0;
        this.currentSegmentRemaining = 0;
        this.remainingTotalCost = wcet;

        this.state = (offset === 0) ? STATE.READY : STATE.COMPLETED;
        this.heldResources = new Set(); // What we explicitly own right now

        // Priority State
        this.basePriority = period; // RMS Default
        this.currentPriority = this.basePriority;

        this.blockedOn = null;      // Resource ID we are waiting for
        this.ceilingBlocker = null; // Task ID causing PCP block

        this.releaseTime = 0;
        this.nextDeadline = 0;
        this.color = this.getRandomColor();
    }

    reset() {
        this.currentSegmentIndex = 0;
        this.currentSegmentRemaining = 0;
        this.remainingTotalCost = (this.offset === 0) ? this.wcet : 0;
        this.state = (this.offset === 0) ? STATE.READY : STATE.COMPLETED;
        this.heldResources.clear();
        this.currentPriority = this.basePriority;
        this.blockedOn = null;
        this.ceilingBlocker = null;
    }

    checkRelease(time) {
        if (time < this.offset) return false;
        if ((time - this.offset) % this.period === 0) {
            this.state = STATE.READY;
            this.currentSegmentIndex = 0;
            this.currentSegmentRemaining = 0;
            this.remainingTotalCost = this.wcet;
            this.heldResources.clear(); // Safety clear
            // Prepare first segment
            if (this.segments.length > 0) {
                this.currentSegmentRemaining = this.segments[0].duration;
            }
            return true;
        }
        return false;
    }

    getCurrentSegment() {
        if (this.currentSegmentIndex >= this.segments.length) return null;
        return this.segments[this.currentSegmentIndex];
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
