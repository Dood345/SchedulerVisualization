export class Resource {
    constructor(id, ceilingPriority = 0) {
        this.id = id;
        this.owner = null; // Task Object
        this.ceilingPriority = ceilingPriority; // PCP: Highest priority of ANY task that fits this resource
        this.blockedQueue = []; // Tasks waiting for this resource
    }

    isLocked() {
        return this.owner !== null;
    }
}
