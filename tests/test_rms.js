import { Task } from '../modules/Task.js';
import { Scheduler } from '../modules/Scheduler.js';

const sched = new Scheduler();

// UPDATE: Define tasks using the new Segment structure
// Constructor: (id, period, wcet, offset, segments)

// Create Task A (P=10, C=3)
// We define C=3 as a single segment of duration 3 requiring no resources.
const taskA = new Task('A', 10, 3, 0, [
    { duration: 3, resources: [] }
]);

// Create Task B (P=20, C=5)
// We define C=5 as a single segment of duration 5 requiring no resources.
const taskB = new Task('B', 20, 5, 0, [
    { duration: 5, resources: [] }
]);

sched.addTask(taskA);
sched.addTask(taskB);

console.log(`Calculated Hyperperiod: ${sched.hyperperiod} (Expected: 20)`);

const history = sched.run();

console.log("\nSimulation Sequence:");
history.forEach(tick => {
    const running = tick.runningTaskId || 'IDLE';
    // Optional: Log state to debug if needed
    // const stateA = tick.tasks.find(t => t.id === 'A').state;
    // console.log(`T=${tick.time}: ${running} (A:${stateA})`);
    console.log(`T=${tick.time}: ${running}`);
});

// Verification assertions
const ticksA = history.filter(h => h.runningTaskId === 'A').length;
const ticksB = history.filter(h => h.runningTaskId === 'B').length;

console.log(`\nStats:`);
console.log(`Task A executed ${ticksA} ticks (Expected 6 in 20 units)`);
// A runs twice (Period 10, Cost 3) -> 3 * 2 = 6 ticks
console.log(`Task B executed ${ticksB} ticks (Expected 5 in 20 units)`);
// B runs once (Period 20, Cost 5) -> 5 * 1 = 5 ticks

if (sched.hyperperiod === 20 && ticksA === 6 && ticksB === 5) {
    console.log("\n[SUCCESS] Phase 1 Verification Passed");
    // process.exit(0); // If running in Node
} else {
    console.log("\n[FAILED] Phase 1 Verification Failed");
    console.log(`Hyperperiod: ${sched.hyperperiod}, A: ${ticksA}, B: ${ticksB}`);
    // process.exit(1); // If running in Node
}