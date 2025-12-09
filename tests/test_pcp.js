import { Task } from '../modules/Task.js';
import { Resource } from '../modules/Resource.js';
import { Scheduler } from '../modules/Scheduler.js';

const sched = new Scheduler();
sched.addResource(new Resource('R1'));
sched.addResource(new Resource('R2'));

// Deadlock Scenario (Same as test_deadlock.js)
const tA = new Task('A', 50, 10, 0); // Low 50, Prio 2
tA.basePriority = 2; tA.currentPriority = 2;
tA.addResourceRequest('R1', 0, 10);
tA.addResourceRequest('R2', 2, 5);

const tB = new Task('B', 20, 10, 1); // High 20, Prio 1
tB.basePriority = 1; tB.currentPriority = 1;
tB.addResourceRequest('R2', 0, 10);
tB.addResourceRequest('R1', 1, 5);

sched.addTask(tA);
sched.addTask(tB);

// Enable PCP
sched.enablePCP = true;
sched.enablePIP = false; // PCP implies PIP logic already implemented in simple block found

console.log("Running Deadlock Scenario WITH PCP...");
// Ceilings:
// R1 used by A(2), B(1). Ceiling = 1.
// R2 used by A(2), B(1). Ceiling = 1.

// T=0: A runs. Wants R1.
// System Ceiling: None locked (Infinity). 
// A(2) < Infinity. Access Granted. A locks R1.
// System Ceiling now = R1.ceiling = 1.

// T=1: B (Prio 1) arrives. Preempts A? 
// B runs. Wants R2.
// System Ceiling = 1 (R1 held by A).
// B Prio = 1.
// Rule: Prio < SysCeil. 1 < 1? False. (Not strictly higher).
// Access Denied! B Blocks on PCP (Waiting for A).
// Inheritance: A inherits B's Prio 1.

// T=1: A runs (Inherited Prio 1).
// A holds R1. Needs... nothing new yet. Just runs.

// T=2: A needs R2.
// System Ceiling = 1 (R1). A holds R1.
// Exception: T holds the resource defining the ceiling?
// R1 defines ceiling 1. A holds R1.
// So A can lock R2?
// If A locks R2, A holds R1, R2.
// Then A finishes R2, R1.
// Then B runs.

// Deadlock Prevented!

try {
    const history = sched.run(20);
    console.log("Status: " + sched.status);

    // Check if Deadlock occurred
    if (sched.status === "DEADLOCK") {
        console.log("[FAIL] Deadlock still occurred with PCP!");
    } else {
        console.log("[SUCCESS] PCP prevented deadlock. Simulation finished.");
    }

    // Check execution
    // A should run early. B should run after.
    // T=1: B requested R2 but blocked. A ran.
    let tick1 = history.find(h => h.time === 1);
    console.log(`T=1 Running: ${tick1.runningTaskId} (Expected A due to PCP block on B)`);

} catch (e) {
    console.log("Error: " + e.message);
}
