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
            const res = this.resources.get(op.target);
            if (!res) {
                console.error(`Resource ${op.target} not found!`);
                task.pc++;
                task.loadInstruction();
                return;
            }

            // CHECK: Can we lock?
            let canLock = false;

            // PCP Logic
            if (this.enablePCP) {
                const sysCeil = this.getSystemCeiling();
                // Rule: Prio > SysCeil (Strictly Higher Prio = Lower Value)
                // EXCEPT if this task holds the resource that is creating the ceiling.
                // Simplified: If task doesn't hold any resources, it must be > System Ceiling.

                // We need to know if we hold the resource defining the ceiling.
                // Hard to check efficiently without tracking 'held resources'.
                // Standard logic: Current Prio < SysCeil (since Lower Val = Higher Prio)

                if (task.currentPriority < sysCeil) {
                    canLock = true;
                } else {
                    // Check if WE are the one holding the semaphore causing the ceiling?
                    // (Allow nested locks)
                    // If we are the owner of the resource that set sysCeil...
                    let permission = false;
                    this.resources.forEach(r => {
                        if (r.isLocked() && r.owner === task && r.ceilingPriority === sysCeil) {
                            permission = true;
                        }
                    });
                    if (permission) canLock = true;
                }

                // Also check physical availability
                if (res.isLocked() && res.owner !== task) canLock = false;

            } else {
                // Default / PIP: Only check if free
                if (!res.isLocked() || res.owner === task) {
                    canLock = true;
                }
            }

            if (canLock) {
                // Acquire
                if (res.owner !== task) {
                    res.owner = task;
                    // console.log(`[${this.currentTime}] ${task.id} Locked ${res.id}`);
                }
                task.pc++;
                task.loadInstruction();
            } else {
                // Block
                this.blockTask(task, res);
            }
        }
        else if (op.type === 'UNLOCK') {
            const res = this.resources.get(op.target);
            if (res && res.owner === task) {
                res.owner = null;
                // console.log(`[${this.currentTime}] ${task.id} Unlocked ${res.id}`);

                // PIP: Restore Priority?
                // If we inherited priority, we should drop it.
                // Standard PIP: Return to base priority OR highest priority of remaining formatted blocked tasks.
                if (this.enablePIP) {
                    // Simple PIP: Reset to base. 
                    // Better PIP: Recalculate based on other locks held?
                    // For this simple sim, we assume 1 lock at a time or simple nesting.
                    // Reset to base is safest first step.
                    // If we hold other locks, we technically should check max(blocked_queue_of_other_locks).
                    // Let's implement Recalculate.

                    let maxPrioOfBlockers = task.basePriority;
                    // Check all resources this task still owns
                    this.resources.forEach(r => {
                        if (r.owner === task && r.blockedQueue.length > 0) {
                            // Find highest priority blocked task
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
                // Just move them to READY? Or let Scheduler pick them up?
                // We clear their blocked state.
                if (res.blockedQueue.length > 0) {
                    // Wake all? Or just one?
                    // Usually just let them retry.
                    res.blockedQueue.forEach(t => {
                        t.state = STATE.READY;
                        t.blockedOn = null;
                    });
                    res.blockedQueue = [];
                }
            }
            task.pc++;
            task.loadInstruction();
        }
    }

    blockTask(task, resource) {
        task.state = STATE.BLOCKED;
        task.blockedOn = resource.id;
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
        if (this.enablePIP && resource.owner) {
            const owner = resource.owner;
            if (task.currentPriority < owner.currentPriority) {
                // Inherit
                owner.currentPriority = task.currentPriority;
                // Propagate? If owner is also blocked...
                // Recursive inheritance check
                this.propagatePriority(owner);
            }
        }
    }

    propagatePriority(task) {
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
                });
                r.blockedQueue = [];
            }
        });
        task.currentPriority = task.basePriority;
    }
}
