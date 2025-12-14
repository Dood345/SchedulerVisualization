import { Task } from '../modules/Task.js';
import { Resource } from '../modules/Resource.js';
import { Scheduler } from '../modules/Scheduler.js';

const sched = new Scheduler();
sched.addResource(new Resource('R1'));
sched.addResource(new Resource('R2'));

// ---------------------------------------------------------
// Task A (Low Priority, Period 50)
// Original: Cost 10. Offset 0.
// Requests: R1(0-10), R2(2-7) (Nested R2 inside R1)
// ---------------------------------------------------------
// Segments Translation:
// 1. [0-2ms] Hold R1
// 2. [2-7ms] Hold R1 + R2 (Duration 5)
// 3. [7-10ms] Hold R1 (Duration 3)
const tA = new Task('A', 50, 10, 0, [
    { duration: 2, resources: ['R1'] },
    { duration: 5, resources: ['R1', 'R2'] },
    { duration: 3, resources: ['R1'] }
]);
// Force explicit priorities if needed, but RMS (P=50) sets it to 50 automatically.
// The code relies on smaller number = higher priority.
// A (50) < B (20) ? No. B is higher priority.

// ---------------------------------------------------------
// Task B (High Priority, Period 20)
// Original: Cost 10. Offset 1.
// Requests: R2(0-10), R1(1-6) (Nested R1 inside R2)
// ---------------------------------------------------------
// Segments Translation:
// 1. [0-1ms] Hold R2
// 2. [1-6ms] Hold R2 + R1 (Duration 5)
// 3. [6-10ms] Hold R2 (Duration 4)
const tB = new Task('B', 20, 10, 1, [
    { duration: 1, resources: ['R2'] },
    { duration: 5, resources: ['R2', 'R1'] },
    { duration: 4, resources: ['R2'] }
]);

sched.addTask(tA);
sched.addTask(tB);

// Enable PCP (and implicitly the PIP logic inside it)
sched.enablePCP = true;
sched.enablePIP = false;

console.log("Running Deadlock Scenario WITH PCP...");

try {
    const history = sched.run(20);
    console.log("Status: " + sched.status);

    // Check if Deadlock occurred
    if (sched.status === "DEADLOCK") {
        console.log("[FAIL] Deadlock still occurred with PCP!");
    } else {
        console.log("[SUCCESS] PCP prevented deadlock. Simulation finished.");
    }

    // ---------------------------------------------------------
    // Verification Logic (T=1)
    // ---------------------------------------------------------
    // T=0: A runs, locks R1. System Ceiling = 1 (High).
    // T=1: B arrives (High Prio). Preempts A.
    // B tries to execute Seg 1 (Needs R2).
    // PCP Check: B.prio (20) vs Ceiling (20/High).
    // Is B strictly higher than Ceiling? No.
    // Result: B should block on Ceiling. 
    // NOTE: Locking attempt consumes 1 tick. So T=1 is B (Blocked).
    // T=2: Scheduler picks A (since B is Refused). A should inherit and run.

    let tick1 = history.find(h => h.time === 1);
    let tick2 = history.find(h => h.time === 2);

    console.log(`T=1 Running: ${tick1 ? tick1.runningTaskId : 'None'}`);
    console.log(`T=2 Running: ${tick2 ? tick2.runningTaskId : 'None'}`);

    if (tick1 && tick1.runningTaskId === 'B' && tick2 && tick2.runningTaskId === 'A') {
        console.log("[PASS] Correct Behavior: B tried to lock (T=1) and Blocked. A ran at T=2.");
    } else {
        console.log("[FAIL] Incorrect Behavior.");
    }

} catch (e) {
    console.log("Error: " + e.message);
    console.error(e);
}