export class Resource {
    constructor(id, ceilingPriority = 0) {
        this.id = id;
        this.owner = null; // Task Object or ID
        this.ceilingPriority = ceilingPriority; // For PCP
        this.blockedQueue = [];
    }

    isLocked() {
        return this.owner !== null;
    }
}
