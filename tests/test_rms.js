import { Task } from '../modules/Task.js';
import { Scheduler } from '../modules/Scheduler.js';

const sched = new Scheduler();

// Create Task A (P=10, C=3)
const taskA = new Task('A', 10, 3);
// Create Task B (P=20, C=5)
const taskB = new Task('B', 20, 5);

sched.addTask(taskA);
sched.addTask(taskB);

console.log(`Calculated Hyperperiod: ${sched.hyperperiod} (Expected: 20)`);

const history = sched.run();

console.log("\nSimulation Sequence:");
history.forEach(tick => {
    const running = tick.runningTaskId || 'IDLE';
    console.log(`T=${tick.time}: ${running}`);
});

// Verification assertions
const ticksA = history.filter(h => h.runningTaskId === 'A').length;
const ticksB = history.filter(h => h.runningTaskId === 'B').length;

console.log(`\nStats:`);
console.log(`Task A executed ${ticksA} ticks (Expected 6 in 20 units)`);
console.log(`Task B executed ${ticksB} ticks (Expected 5 in 20 units)`);

if (sched.hyperperiod === 20 && ticksA === 6 && ticksB === 5) {
    console.log("\n[SUCCESS] Phase 1 Verification Passed");
} else {
    console.log("\n[FAILED] Phase 1 Verification Failed");
}
