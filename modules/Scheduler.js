import { STATE } from './Task.js';
import { Resource } from './Resource.js';

function gcd(a, b) { return !b ? a : gcd(b, a % b); }
function lcm(a, b) { return (a * b) / gcd(a, b); }

export class Scheduler {
    constructor() {
        this.tasks = [];
        this.resources = new Map();
        this.history = [];
        this.currentTime = 0;
        this.hyperperiod = 0;
        this.enablePIP = false;
        this.enablePCP = false; // Phase 5
    }

    addTask(task) {
        this.tasks.push(task);
        this.calculateHyperperiod();
    }

    addResource(resource) {
        this.resources.set(resource.id, resource);
    }

    calculateHyperperiod() {
        if (this.tasks.length === 0) {
            this.hyperperiod = 0;
            return;
        }
        let periods = this.tasks.map(t => t.period);
        this.hyperperiod = periods.reduce((acc, val) => lcm(acc, val), periods[0]);
    }

    calculateCeilings() {
        // Reset ceilings
        this.resources.forEach(r => r.ceilingPriority = 999);

        this.tasks.forEach(t => {
            t.resourceRequests.forEach(req => {
                let res = this.resources.get(req.resId);
                // Lower Value = Higher Priority
                if (res && t.basePriority < res.ceilingPriority) {
                    res.ceilingPriority = t.basePriority;
                }
            });
        });
    }

    reset() {
        this.currentTime = 0;
        this.history = [];
        this.tasks.forEach(t => t.reset());
        this.resources.forEach(r => {
            r.owner = null;
            r.blockedQueue = [];
        });
    }

    run(duration = null) {
        if (this.enablePCP) this.calculateCeilings();
        const limit = duration || this.hyperperiod;
        this.reset();
        for (let t = 0; t < limit; t++) {
            this.tick(t);
        }
        return this.history;
    }

    tick(time) {
        this.currentTime = time;

        // 1. Release Tasks
        this.tasks.forEach(task => {
            if (task.checkRelease(time)) {
                task.currentPriority = task.basePriority;
                task.blockedOn = null;
            }
        });

        // 2. Scheduler Selection Loop
        // We might need to handle PIP restoration if a task finishes. 
        // Logic: Find highest priority READY task. Check if it's blocked.

        let attempts = 0;
        let runningTask = null;

        // Candidate Tasks: Ready, Running, or Blocked (to check if they become unblocked? No, Blocked stay blocked until owner releases)
        // Actually, we just look at Ready/Running tasks to pick *who wants to run*.

        // Helper: Get active candidate tasks
        let readyTasks = this.tasks.filter(t => t.state === STATE.READY || t.state === STATE.RUNNING || t.state === STATE.BLOCKED);

        // Sort by CURRENT Priority (Lower value is higher priority)
        readyTasks.sort((a, b) => a.currentPriority - b.currentPriority);

        // Try to run the top task
        for (let task of readyTasks) {
            // Check if this task needs to acquire a resource NOW
            let neededRes = task.resourceRequests.find(r => r.startAt === task.executedInPeriod);

            if (neededRes) {
                let res = this.resources.get(neededRes.resId);

                // PCP Check
                let pcpBlock = false;
                let pcpBlocker = null;
                if (this.enablePCP && !res.isLocked()) {
                    let sysCeil = 999;
                    let blockerRes = null;
                    this.resources.forEach(r => {
                        if (r.isLocked() && r.owner !== task) {
                            if (r.ceilingPriority < sysCeil) {
                                sysCeil = r.ceilingPriority;
                                blockerRes = r;
                            }
                        }
                    });
                    if (task.currentPriority >= sysCeil) {
                        pcpBlock = true;
                        pcpBlocker = blockerRes ? blockerRes.owner : null;
                    }
                }

                if ((res.isLocked() && res.owner !== task) || pcpBlock) {
                    // DEADLOCK DETECTION
                    let cycleFound = false;
                    let currOwner = res.owner;
                    let visited = new Set();
                    visited.add(task.id);

                    while (currOwner) {
                        if (visited.has(currOwner.id)) {
                            cycleFound = true;
                            break;
                        }
                        visited.add(currOwner.id);
                        if (currOwner.state === STATE.BLOCKED && currOwner.blockedOn) {
                            let nextRes = this.resources.get(currOwner.blockedOn);
                            currOwner = nextRes ? nextRes.owner : null;
                        } else {
                            break;
                        }
                    }

                    if (cycleFound) {
                        this.status = "DEADLOCK";
                        console.error(`[DEADLOCK] Detected cycle involving ${task.id}`);
                        // Don't throw, just stop or handle
                        return;
                    }

                    // BLOCKING
                    task.state = STATE.BLOCKED;
                    task.blockedOn = res.id;
                    res.blockedQueue.push(task);

                    // PIP Logic
                    if (this.enablePIP) {
                        let owner = res.owner;
                        // Determine inheritance
                        // If Task (High Prio, Low Val) is blocked by Owner (Low Prio, High Val)
                        // Owner inherits Task's priority
                        if (task.currentPriority < owner.currentPriority) {
                            // console.log(`[PIP] ${owner.id} inherits ${task.currentPriority} from ${task.id}`);
                            owner.currentPriority = task.currentPriority;
                            // Re-sort needed check? Yes, owner might now be highest priority.
                            // But for this tick, we just continue this loop.
                            // The owner should be in readyTasks set if it's not finished.
                            // We need to re-evaluate the highest priority task this tick.
                        }
                    }
                    continue; // This task is blocked, try next
                } else {
                    // Acquire
                    if (!res.isLocked()) {
                        // PCP Check (Phase 5 placeholder)
                        res.owner = task;
                    }
                }
            }

            // If we are here, task is runnable
            runningTask = task;
            break;
        }

        // If no ready task found, check if we have a task that is BLOCKED but maybe logic failed? 
        // No, if blocked, it's blocked.
        // It's possible the "Owner" of the lock is now the highest priority runnable task (due to PIP).
        // Let's re-scan readyTasks to be safe? 
        // If PIP changed priority, `owner` should now be at top of `readyTasks` if we re-sorted.
        // Simplified: The loop above skips blocked tasks. If PIP happened, the `owner` (which is READY) 
        // should be picked up in subsequent iterations of the loop if strictly ordered?
        // Actually, if we modify `currentPriority` inside the loop, the `readyTasks` array is NOT re-sorted.
        // We might miss the owner if it was later in the list.

        // Correct approach: If PIP updates priority, RESTART selection?
        // Or just let it run next tick? No, must run NOW.
        // Let's do a simple recursive-like check or just re-sort if PIP applied.

        // For simplicity in this implementation:
        // If PIP applies, we know the OWNER is the one we want to run (or someone higher).
        // Let's just find the owner and run it?
        // Better: Re-sort if we modified priorities.
        if (this.enablePIP && readyTasks.length > 0) {
            readyTasks.sort((a, b) => a.currentPriority - b.currentPriority);
            // Re-run selection logic (simplified)
            for (let task of readyTasks) {
                if (task.state === STATE.BLOCKED) continue;
                let neededRes = task.resourceRequests.find(r => r.startAt === task.executedInPeriod);
                if (neededRes) {
                    let res = this.resources.get(neededRes.resId);
                    if (res.isLocked() && res.owner !== task) continue; // Still blocked
                }
                runningTask = task;
                break;
            }
        }


        // 3. Execution
        if (runningTask) {
            runningTask.state = STATE.RUNNING;
            runningTask.remainingCost--;
            runningTask.executedInPeriod++;

            // Release Resource Check
            // Check if any resource duration ended
            runningTask.resourceRequests.forEach(req => {
                if (runningTask.executedInPeriod === req.startAt + req.duration) {
                    let res = this.resources.get(req.resId);
                    if (res.owner === runningTask) {
                        res.owner = null;
                        // PIP Restore
                        if (this.enablePIP) {
                            // Reset to base
                            runningTask.currentPriority = runningTask.basePriority;
                            // Check if we are still blocking others? 
                            // If holding other resources, might need to effectively be max(others).
                            // For this simple simulation, reset to base is standard "Basic PIP".
                        }
                    }
                }
            });

            if (runningTask.remainingCost <= 0) {
                runningTask.state = STATE.COMPLETED;
                // Failsafe unlock (if task dies holding lock)
                this.resources.forEach(r => {
                    if (r.owner === runningTask) {
                        r.owner = null;
                        runningTask.currentPriority = runningTask.basePriority;
                    }
                });
            }
        }

        // 4. Record History
        const snapshot = this.tasks.map(t => ({
            id: t.id,
            state: (t === runningTask) ? STATE.RUNNING : (t.state === STATE.RUNNING ? STATE.READY : t.state),
            remaining: t.remainingCost,
            prio: t.currentPriority, // Log priority to see PIP
            blockedOn: t.blockedOn
        }));

        this.history.push({
            time: time,
            runningTaskId: runningTask ? runningTask.id : null,
            tasks: snapshot
        });
    }
}
