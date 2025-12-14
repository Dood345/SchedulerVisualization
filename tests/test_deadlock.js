import { Task } from '../modules/Task.js';
import { Resource } from '../modules/Resource.js';
import { Scheduler } from '../modules/Scheduler.js';

const sched = new Scheduler();
sched.addResource(new Resource('R1'));
sched.addResource(new Resource('R2'));

// ---------------------------------------------------------
// Task A (Low Priority, Period 50)
// Starts T=0.
// Logic: Locks R1 immediately. Runs for 2ms. Then tries to Lock R2.
// ---------------------------------------------------------
// Segments:
// 1. [0-2ms] Hold R1 (Duration 2)
// 2. [2-7ms] Hold R1 + R2 (Duration 5)
// 3. [7-10ms] Hold R1 (Duration 3)
const tA = new Task('A', 50, 10, 0, [
    { duration: 2, resources: ['R1'] },
    { duration: 5, resources: ['R1', 'R2'] },
    { duration: 3, resources: ['R1'] }
]);
// Force Low Priority
tA.basePriority = 2;
tA.currentPriority = 2;

// ---------------------------------------------------------
// Task B (High Priority, Period 20)
// Starts T=1 (Offset).
// Logic: Locks R2 immediately. Runs for 1ms. Then tries to Lock R1.
// ---------------------------------------------------------
// Segments:
// 1. [0-1ms] Hold R2 (Duration 1)
// 2. [1-6ms] Hold R2 + R1 (Duration 5)
// 3. [6-10ms] Hold R2 (Duration 4)
const tB = new Task('B', 20, 10, 1, [
    { duration: 1, resources: ['R2'] },
    { duration: 5, resources: ['R2', 'R1'] },
    { duration: 4, resources: ['R2'] }
]);
// Force High Priority
tB.basePriority = 1;
tB.currentPriority = 1;

sched.addTask(tA);
sched.addTask(tB);

console.log("Running Deadlock Simulation (Protocol=NONE)...");

// ---------------------------------------------------------
// Expected Execution Flow
// ---------------------------------------------------------
// T=0: A runs (Low). Locks R1. Exec 1/2 of Seg 1.
// T=1: B arrives (High). Preempts A.
//      B runs. Locks R2. Exec 1/1 of Seg 1.
// T=2: B tries to enter Seg 2. Needs R1. 
//      R1 is held by A. B BLOCKS.
//      Scheduler switches back to A.
//      A runs. Exec 2/2 of Seg 1.
// T=3: A tries to enter Seg 2. Needs R2.
//      R2 is held by B. A BLOCKS.
//      DEADLOCK DETECTED (A waits for B, B waits for A).

try {
    const history = sched.run(10);
} catch (e) {
    console.log("Caught expected error (if any): " + e.message);
}

console.log(`\nFinal Scheduler Status: ${sched.status}`);

if (sched.status === "DEADLOCK") {
    console.log("[SUCCESS] Deadlock Detected correctly.");

    // Optional: Verify the state of the tasks
    const stateA = tA.state;
    const stateB = tB.state;
    console.log(`State A: ${stateA} (Blocked on ${tA.blockedOn})`);
    console.log(`State B: ${stateB} (Blocked on ${tB.blockedOn})`);

} else {
    console.log("[FAIL] Deadlock NOT detected.");
    // Debug log
    // console.log(sched.history);
}