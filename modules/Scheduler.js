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
        this.enablePCP = false;
        this.status = 'OK';
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
        // PCP: Calculate System Ceiling for each resource
        // The ceiling of a resource R is the highest priority of any task that MAY use R.
        // In this static model, we scan all tasks to see who uses what.

        // 1. Reset ceilings to Lowest Priority (High Number)
        this.resources.forEach(r => r.ceilingPriority = 999);

        // 2. Scan
        this.tasks.forEach(task => {
            // Check all instructions for LOCK ops
            const usedResources = new Set();
            task.instructions.forEach(op => {
                if (op.type === 'LOCK') usedResources.add(op.target);
            });

            usedResources.forEach(resId => {
                const res = this.resources.get(resId);
                // Lower Value = Higher Priority
                if (res && task.basePriority < res.ceilingPriority) {
                    res.ceilingPriority = task.basePriority;
                }
            });
        });
    }

    reset() {
        this.currentTime = 0;
        this.history = [];
        this.status = 'OK';
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
            if (this.status === 'DEADLOCK') break;
            this.tick(t);
        }
        return this.history;
    }

    /**
     * Get current System Ceiling (PCP).
     * Max (Highest Priority = Lowest Value) of ceilings of all CURRENTLY LOCKED resources.
     */
    getSystemCeiling() {
        let maxCeiling = 999;
        this.resources.forEach(r => {
            if (r.isLocked()) {
                if (r.ceilingPriority < maxCeiling) {
                    maxCeiling = r.ceilingPriority;
                }
            }
        });
        return maxCeiling;
    }

    tick(time) {
        this.currentTime = time;

        // 1. Check Arrivals (Release Tasks)
        this.tasks.forEach(task => {
            if (task.checkRelease(time)) {
                // Task Released
                task.currentPriority = task.basePriority;
            }
        });

        // 2. Select Highest Priority Ready/Running Task
        // Filter: Ready, Running, or Blocked (we check blocked to see if they can unblock... actually blocked stays blocked until event)
        // We only consider tasks that CAN run. Blocked tasks cannot run.
        let readyTasks = this.tasks.filter(t => t.state === STATE.READY || t.state === STATE.RUNNING);

        // Blocked tasks are managed via waiting queues/events, but we need to check if they caused PIP inheritance.
        // Actually, PIP inheritance updates happen immediately upon blocking.
        // So we just trust `currentPriority`.

        readyTasks.sort((a, b) => a.currentPriority - b.currentPriority);

        let runningTask = readyTasks.length > 0 ? readyTasks[0] : null;

        // 3. Execution Logic
        if (runningTask) {
            runningTask.state = STATE.RUNNING;

            // Execute Instruction
            this.executeInstruction(runningTask);

            // If task finished everything?
            if (runningTask.pc >= runningTask.instructions.length) {
                this.completeTask(runningTask);
                // After completion, we might need to re-schedule if it released locks (implied UNLOCK at end?)
                // Ideally input tasks explicitly UNLOCK. But `completeTask` ensures safety.
            }
        }

        // 4. Record History
        const snapshot = this.tasks.map(t => {
            // Identify held resources
            const held = [];
            this.resources.forEach(r => {
                if (r.owner === t) held.push(r.id);
            });

            return {
                id: t.id,
                state: (t === runningTask) ? STATE.RUNNING : (t.state === STATE.RUNNING ? STATE.READY : t.state),
                // Note: If runningTask finished in this tick, it might show COMPLETED.
                remaining: t.remainingTotalCost,
                prio: t.currentPriority,
                basePrio: t.basePriority,
                isPriorityBoosted: (t.currentPriority < t.basePriority), // Lower value = Higher priority
                blockedOn: t.blockedOn,
                heldResources: held
            };
        });

        this.history.push({
            time: time,
            runningTaskId: runningTask ? runningTask.id : null,
            tasks: snapshot
        });
    }

    executeInstruction(task) {
        if (task.pc >= task.instructions.length) return;

        const op = task.instructions[task.pc];

        if (op.type === 'COMPUTE') {
            task.currentInstructionRemaining--;
            task.remainingTotalCost--;
            if (task.currentInstructionRemaining <= 0) {
                task.pc++;
                task.loadInstruction();
            }
        }
        else if (op.type === 'LOCK') {
            // Refactored: Logic moved to helper
            const success = this.attemptLock(task, op.target);
            if (success) {
                task.pc++;
                task.loadInstruction();
            }
            // If false, attemptLock already handled the blocking/queueing
        }
        else if (op.type === 'UNLOCK') {
            this.unlockResource(task, op.target);
            task.pc++;
            task.loadInstruction();
        }
    }

    attemptLock(task, resourceId) {
        const res = this.resources.get(resourceId);
        if (!res) {
            console.error(`Resource ${resourceId} not found!`);
            return true; // Skip invalid instruction
        }

        let canLock = false;
        let ceilingHolder = null;

        // --- PCP LOGIC ---
        if (this.enablePCP) {
            const sysCeil = this.getSystemCeiling();

            // Rule: Priority must be STRICTLY HIGHER (Lower Value) than System Ceiling
            if (task.currentPriority < sysCeil) {
                canLock = true;
            } else {
                // Exception: Do we hold the lock that is causing this ceiling?
                let holdsCeiling = false;
                this.resources.forEach(r => {
                    if (r.isLocked() && r.owner === task && r.ceilingPriority === sysCeil) {
                        holdsCeiling = true;
                    }
                });

                if (holdsCeiling) {
                    canLock = true;
                } else {
                    // Blocked by Ceiling - Find who to boost
                    for (let r of this.resources.values()) {
                        if (r.isLocked() && r.ceilingPriority === sysCeil && r.owner !== task) {
                            ceilingHolder = r.owner;
                            break;
                        }
                    }
                }
            }
            // Physical Check: Even if PCP says OK, is it physically free?
            if (res.isLocked() && res.owner !== task) canLock = false;

        } else {
            // --- DEFAULT / PIP LOGIC ---
            if (!res.isLocked() || res.owner === task) {
                canLock = true;
            }
        }

        // --- EXECUTE ---
        if (canLock) {
            if (res.owner !== task) {
                res.owner = task;
            }
            return true;
        } else {
            // Block the task (passing the ceiling holder if applicable)
            this.blockTask(task, res, ceilingHolder);
            return false;
        }
    }

    unlockResource(task, resourceId) {
        const res = this.resources.get(resourceId);
        if (res && res.owner === task) {
            res.owner = null;

            // Restore Priority Logic
            if (this.enablePIP || this.enablePCP) {
                let maxPrioOfBlockers = task.basePriority;
                this.resources.forEach(r => {
                    if (r.owner === task && r.blockedQueue.length > 0) {
                        r.blockedQueue.forEach(bTask => {
                            if (bTask.currentPriority < maxPrioOfBlockers) {
                                maxPrioOfBlockers = bTask.currentPriority;
                            }
                        });
                    }
                });
                task.currentPriority = maxPrioOfBlockers;
            }

            // Wake up waiting tasks
            if (res.blockedQueue.length > 0) {
                res.blockedQueue.forEach(t => {
                    t.state = STATE.READY;
                    t.blockedOn = null;
                    t.ceilingBlocker = null;
                });
                res.blockedQueue = [];
            }
        }
    }

    blockTask(task, resource, ceilingHolder = null) {
        task.state = STATE.BLOCKED;
        task.blockedOn = resource.id;

        if (ceilingHolder) {
            task.ceilingBlocker = ceilingHolder;
        }

        if (!resource.blockedQueue.includes(task)) {
            resource.blockedQueue.push(task);
        }

        // Deadlock Detection
        if (this.detectDeadlock(task)) {
            this.status = 'DEADLOCK';
            // Mark all tasks in cycle as DEADLOCKED
            task.state = STATE.DEADLOCKED;

            // Naive propagation: Try to mark others
            // Better: detectDeadlock could return the cycle list?
            // Or just iterate standard blocked tasks?
            // Simple heuristic: If DEADLOCK state, any task blocked on a DEADLOCKED task is also DEADLOCKED.
            // We can do a quick pass.
            let changed = true;
            while (changed) {
                changed = false;
                this.tasks.forEach(t => {
                    if (t.state === STATE.BLOCKED && t.blockedOn) {
                        const r = this.resources.get(t.blockedOn);
                        if (r && r.owner && r.owner.state === STATE.DEADLOCKED) {
                            t.state = STATE.DEADLOCKED;
                            changed = true;
                        }
                    }
                });
            }
            return;
        }

        // PIP: Inheritance
        if (this.enablePIP || this.enablePCP) {
            // 1. Blocked by Owner
            if (resource.owner) {
                const owner = resource.owner;
                if (task.currentPriority < owner.currentPriority) {
                    owner.currentPriority = task.currentPriority;
                    this.propagatePriority(owner);
                }
            }
            // 2. Blocked by Ceiling Holder (PCP only really)
            if (ceilingHolder) {
                if (task.currentPriority < ceilingHolder.currentPriority) {
                    ceilingHolder.currentPriority = task.currentPriority;
                    this.propagatePriority(ceilingHolder);
                }
            }
        }
    }

    propagatePriority(task) {
        // Case 1: Blocked on Resource
        if (task.state === STATE.BLOCKED && task.blockedOn) {
            const res = this.resources.get(task.blockedOn);
            if (res && res.owner) {
                const owner = res.owner;
                if (task.currentPriority < owner.currentPriority) {
                    owner.currentPriority = task.currentPriority;
                    this.propagatePriority(owner);
                }
            }
        }
        // Case 2: Blocked by Ceiling
        if (task.state === STATE.BLOCKED && task.ceilingBlocker) {
            const blocker = task.ceilingBlocker;
            if (task.currentPriority < blocker.currentPriority) {
                blocker.currentPriority = task.currentPriority;
                this.propagatePriority(blocker);
            }
        }
    }

    detectDeadlock(startTask) {
        // BFS/DFS for cycle
        let visited = new Set();
        let queue = [startTask];

        while (queue.length > 0) {
            let curr = queue.shift();
            if (visited.has(curr.id)) return true; // Cycle
            visited.add(curr.id);

            if (curr.state === STATE.BLOCKED && curr.blockedOn) {
                const res = this.resources.get(curr.blockedOn);
                if (res && res.owner) {
                    // Check if seeing owner again
                    // Special case: If A waits for B, B waits for A.
                    // Visited: A -> B. Next: B waits for... A. A is in visited.
                    if (visited.has(res.owner.id)) return true;
                    queue.push(res.owner);
                }
            }
        }
        return false;
    }

    completeTask(task) {
        task.state = STATE.COMPLETED;
        // Failsafe: Release all locks
        this.resources.forEach(r => {
            if (r.owner === task) {
                r.owner = null;
                // Wake up
                r.blockedQueue.forEach(t => {
                    t.state = STATE.READY;
                    t.blockedOn = null;
                    t.ceilingBlocker = null;
                });
                r.blockedQueue = [];
            }
        });
        task.currentPriority = task.basePriority;
        task.ceilingBlocker = null;
    }
}
