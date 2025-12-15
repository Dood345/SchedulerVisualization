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
            // Check all segments for resource usage
            const usedResources = new Set();
            if (task.segments) {
                task.segments.forEach(seg => {
                    if (seg.resources) {
                        seg.resources.forEach(r => usedResources.add(r));
                    }
                });
            }

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
        // RESCHEDULE LOOP: If the selected task blocks immediately, try the next one.
        // We do not want to idle the CPU if there is a lower priority task ready to run.
        let runningTask = null;

        // Loop until we find a task that runs (RUNNING/COMPLETED) or we run out of options
        while (true) {
            let readyTasks = this.tasks.filter(t => t.state === STATE.READY || t.state === STATE.RUNNING);

            if (readyTasks.length === 0) {
                runningTask = null; // System Idle
                break;
            }

            readyTasks.sort((a, b) => a.currentPriority - b.currentPriority);

            // Pick highest priority
            let candidate = readyTasks[0];

            // Try to run it
            candidate.state = STATE.RUNNING;
            this.runTaskLogic(candidate);

            // Did it stick?
            if (candidate.state === STATE.RUNNING || candidate.state === STATE.COMPLETED) {
                runningTask = candidate;
                break; // Found our runner
            }

            // If it became BLOCKED (or DEADLOCKED), it is no longer READY/RUNNING.
            // The filter in the next iteration will exclude it.
            // Proceed to next candidate.
        }

        this.runningTask = runningTask; // Store for snapshot visibility check

        // 3. Execution Logic (Already done inside loop)
        // Just need to handle the NULL case (Idle) implicitly.

        // 4. Record History
        const snapshot = this.tasks.map(t => {
            // Identify held resources
            const held = [];
            this.resources.forEach(r => {
                if (r.owner === t) held.push(r.id);
            });

            return {
                id: t.id,
                // FIX: Only mark as RUNNING if it was the selected task AND it is still in RUNNING/COMPLETED state.
                // If it blocked during execution, we must record BLOCKED.
                state: (t === runningTask) ? t.state : (t.state === STATE.RUNNING ? STATE.READY : t.state),
                // Actually simplier: We trust t.state now because we updated it in runTaskLogic or attemptLock.
                // But wait, existing logic forced RUNNING if t===runningTask.
                // Let's rely on t.state directly, but ensure ready tasks show READY.

                // Correction: runTaskLogic sets state=RUNNING. If it blocks, attemptLock sets state=BLOCKED.
                // So t.state IS correct.
                // The only issue is if t was RUNNING but we want to show it as READY implies it wasn't picked?
                // Original logic: (t === runningTask) ? STATE.RUNNING : (t.state === STATE.RUNNING ? STATE.READY : t.state)
                // This logic was: "If I picked you, you are RUNNING. If I didn't pick you but you say RUNNING, you are actually READY."

                // New logic: Trust t.state, UNLESS t.state is RUNNING but t != runningTask (then it's READY).
                // BUT if t == runningTask, we trust t.state (could be RUNNING, BLOCKED, COMPLETED).
                remaining: t.remainingTotalCost,
                prio: t.currentPriority,
                basePrio: t.basePriority,
                isPriorityBoosted: (t.currentPriority < t.basePriority), // Lower value = Higher priority
                blockedOn: t.blockedOn,
                ceilingBlocker: t.ceilingBlocker ? { id: t.ceilingBlocker.id } : null,
                heldResources: held
            };
        });

        this.history.push({
            time: time,
            runningTaskId: runningTask ? runningTask.id : null,
            tasks: snapshot
        });

        // 5. Cleanup Completed Tasks (DELAYED until after history)
        if (runningTask && runningTask.state === STATE.COMPLETED) {
            this.releaseTaskResources(runningTask);
        }
    }

    runTaskLogic(task) {
        let segment = task.getCurrentSegment();
        // 1. Completion Check (Safety catch if called on empty task)
        if (!segment) {
            this.markTaskCompleted(task);
            return;
        }

        // 2. Resource Delta Check
        // We need to ensure we hold EVERYTHING in segment.resources
        const required = new Set(segment.resources || []);
        const missing = [];

        // 2a. Release unneeded resources (Transition from [A,B] -> [A])
        // If we hold something that is NOT in the new requirement, drop it.
        const toRelease = [];
        task.heldResources.forEach(resId => {
            if (!required.has(resId)) {
                toRelease.push(resId);
            }
        });

        toRelease.forEach(resId => {
            this.unlockResource(task, resId);
            task.heldResources.delete(resId);
        });

        // 2b. Identify Missing Resources
        required.forEach(reqId => {
            if (!task.heldResources.has(reqId)) {
                missing.push(reqId);
            }
        });

        // 3. Attempt to Acquire Missing (in order)
        if (missing.length > 0) {
            // Try to lock the first missing resource
            // We only try ONE per tick to simulate standard blocking behavior.
            const nextRes = missing[0];
            const success = this.attemptLock(task, nextRes);

            if (success) {
                // Mark as held in Task local state
                task.heldResources.add(nextRes);

                // Optimization: If this was the ONLY missing resource, strictly proceed to compute 
                // in the same tick (Zero Cost Locking).
                if (missing.length > 1) {
                    return;
                }
                // else: fall through to Compute
            } else {
                // attemptLock already put us in BLOCKED state
                return;
            }
        }

        // 4. Compute (Only if all resources are held)
        task.currentSegmentRemaining--;
        task.remainingTotalCost--;

        // 5. Segment Transition
        if (task.currentSegmentRemaining <= 0) {
            task.currentSegmentIndex++;
            const nextSeg = task.getCurrentSegment();

            if (!nextSeg) {
                // Task Finished
                this.markTaskCompleted(task);
            } else {
                // Load next duration
                task.currentSegmentRemaining = nextSeg.duration;
            }
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

            // PCP: When a resource is unlocked, the System Ceiling drops.
            // We must wake up tasks that were blocked by the previous ceiling (waiting on ANY free resource).
            if (this.enablePCP) {
                this.resources.forEach(r => {
                    // If blockedQueue has tasks, but resource is FREE, they are ceiling-blocked.
                    if (!r.owner && r.blockedQueue.length > 0) {
                        r.blockedQueue.forEach(t => {
                            t.state = STATE.READY;
                            t.blockedOn = null;
                            t.ceilingBlocker = null;
                        });
                        r.blockedQueue = [];
                    }
                });
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

    markTaskCompleted(task) {
        task.state = STATE.COMPLETED;
    }

    releaseTaskResources(task) {
        // Release everything we think we hold
        task.heldResources.forEach(resId => {
            this.unlockResource(task, resId);
        });
        task.heldResources.clear();

        // Release anything the Resource object thinks we hold (Double Safety)
        this.resources.forEach(r => {
            if (r.owner === task) {
                this.unlockResource(task, r.id);
            }
        });

        // Global PCP Wakeup
        if (this.enablePCP) {
            // Re-check System Ceiling in case we freed things
            // Logic inside unlockResource usually handles blockedQueue wakeup.
            // But we might need to check other resources if system ceiling dropped?
            // Actually unlockResource(PCP logic) handles this. 
            // We just ensure all queues are checked if system ceiling dropped.
            // (Implemented in unlockResource: "if blockedQueue has tasks... they are ceiling blocked")
        }

        // Just in case, ensure no one is blocked on this completed task
        this.wakeUpCeilingBlockers();

        task.currentPriority = task.basePriority;
        task.ceilingBlocker = null;
    }

    wakeUpCeilingBlockers() {
        if (!this.enablePCP) return;
        this.resources.forEach(r => {
            if (!r.owner && r.blockedQueue.length > 0) {
                // Potential ceiling unblock
                // We should probably just trigger a re-eval for them?
                // Or set them to READY so they try again in next tick.
                r.blockedQueue.forEach(t => {
                    t.state = STATE.READY;
                    t.blockedOn = null;
                    t.ceilingBlocker = null;
                });
                r.blockedQueue = [];
            }
        });
    }
}
