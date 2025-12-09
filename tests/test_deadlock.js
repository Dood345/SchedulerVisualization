import { Task } from '../modules/Task.js';
import { Resource } from '../modules/Resource.js';
import { Scheduler } from '../modules/Scheduler.js';

const sched = new Scheduler();
sched.addResource(new Resource('R1'));
sched.addResource(new Resource('R2'));

// Deadlock Scenario
// Task A (Prio 1): Needs R1 (t=0, dur=10), Needs R2 (t=1, dur=5)
// Task B (Prio 2): Needs R2 (t=0, dur=10), Needs R1 (t=1, dur=5)
// T=0: A locks R1. B locks R2.
// T=1: A tries lock R2 (Held by B). A Blocks on R2.
// T=1: B tries lock R1 (Held by A). B Blocks on R1.
// Cycle: A -> R2 -> B -> R1 -> A.

const taskA = new Task('A', 20, 10, 0); // High Prio
taskA.basePriority = 1; taskA.currentPriority = 1;
taskA.addResourceRequest('R1', 0, 10);
taskA.addResourceRequest('R2', 1, 5);

const taskB = new Task('B', 20, 10, 0); // Low Prio
taskB.basePriority = 2; taskB.currentPriority = 2; // Actually same prio or lower? 
// If A (1) runs first, it takes R1. 
// Can B run? 
// If single core, B doesn't run at T=0.
// So B must start R2 usage when it gets to run.
// We need A to BLOCK on something else or Yield.
// Or force B to run earlier?
// Let's use offsets.
// A starts T=0. Locks R1.
// A yields/finished quantum? No, non-preemptive manual yielding? No.
// How to get B to run?
// A must blocked or wait.
// Let's say A runs, Locks R1. Then at T=1, A needs R2.
// If B hasn't run, R2 is free. A takes R2. No deadlock.

// Classic deadlock requires interleaved execution.
// A: Lock R1 ... Lock R2.
// B: Lock R2 ... Lock R1.
// We need B to Lock R2 BEFORE A locks R2.
// Scenario:
// T=0: B runs (High Prio?). Locks R2.
// T=1: A runs (Low Prio?). Locks R1.
// T=2: B needs R1. Blocks on A.
// T=3: A needs R2. Blocks on B.
// Deadlock.

const tA = new Task('A', 50, 10, 0); // Low 50
tA.basePriority = 2; tA.currentPriority = 2;
tA.addResourceRequest('R1', 0, 10); // Locks R1 at start
tA.addResourceRequest('R2', 2, 5);  // Later needs R2

const tB = new Task('B', 20, 10, 1); // High 20 (Offset 1)
tB.basePriority = 1; tB.currentPriority = 1;
tB.addResourceRequest('R2', 0, 10); // Locks R2 at start
tB.addResourceRequest('R1', 1, 5);  // Later needs R1

// Flow:
// T=0: A (Ready). B (Wait). A runs. Locks R1. Exec 1.
// T=1: B (Ready). A (Ready). B Prio 1 > A Prio 2.
//      B runs. Locks R2. Exec 1.
// T=2: B runs. Needs R1. R1 held by A. B Blocks on R1.
//      Scheduler picks A (Prio 2).
//      A runs. Exec 2. Needs R2. R2 held by B.
//      A Blocks on R2.
//      Cycle detected? A->R2->B->R1->A.

sched.addTask(tA);
sched.addTask(tB);

console.log("Running Deadlock Simulation...");
try {
    sched.run(10);
} catch (e) {
    console.log("Caught: " + e.message); // Expect Deadlock?
    // My code doesn't throw, it logs [DEADLOCK].
    // Wait, I added deadlock check that logs error.
}

console.log("Checking Deadlock status...");
if (sched.status === "DEADLOCK") {
    console.log("[SUCCESS] Deadlock Detected!");
} else {
    // Check logs manually or status
    // I need to add 'status' property to Scheduler or expose it.
    console.log("[FAIL] Deadlock not detected.");
}
