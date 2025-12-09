import { Task } from '../modules/Task.js';
import { Resource } from '../modules/Resource.js';
import { Scheduler } from '../modules/Scheduler.js';

const sched = new Scheduler();
sched.enablePIP = true;

const R1 = new Resource('R1');
sched.addResource(R1);

// Mars Pathfinder Scenario
// Low (Prio 3) - Starts t=0. Locks R1 at t=0 for 4 ticks.
// High (Prio 1) - Starts t=2. Needs R1 at t=0 (relative) for 2 ticks.
// Med (Prio 2) - Starts t=3. No resources.

// Note: High relative exec time 0 means it needs it immediately upon starting.
// Low needs it immediately.

const taskL = new Task('L', 20, 6, 0); // Prio 20 (Low)
taskL.basePriority = 3; taskL.currentPriority = 3;
taskL.addResourceRequest('R1', 0, 4);

const taskH = new Task('H', 20, 3, 2); // Prio 1 (High), Offset 2
taskH.basePriority = 1; taskH.currentPriority = 1;
taskH.addResourceRequest('R1', 0, 2);

const taskM = new Task('M', 20, 4, 3); // Prio 2 (Med), Offset 3
taskM.basePriority = 2; taskM.currentPriority = 2;

sched.addTask(taskH);
sched.addTask(taskM);
sched.addTask(taskL);

const history = sched.run(15);

console.log("Time | Run | L(Prio) | H(State) | M(State)");
history.forEach(tick => {
    let l = tick.tasks.find(t => t.id === 'L');
    let h = tick.tasks.find(t => t.id === 'H');
    let m = tick.tasks.find(t => t.id === 'M');

    console.log(`${tick.time.toString().padEnd(4)} | ${tick.runningTaskId || '_'}   | L:${l.prio}      | H:${h.state.substring(0, 4)} | M:${m.state.substring(0, 4)}`);
});

// Verification Logic
// 0: L runs (locks R1)
// 1: L runs
// 2: H arrives. H preempts? No, H needs R1. R1 held by L. H Blocks. 
// -- PIP: L should inherit Prio 1.
// 3: M arrives. M (Prio 2). L (Prio 1 due to PIP).
// -- M should NOT preempt L. L continues.
// 4: L runs (finishes R1 usage). Unlocks. Restores Prio 3.
// -- Now H is unblocked (Prio 1). H runs.
// 5: H runs.

const tick3 = history.find(h => h.time === 3);
const l_at_3 = tick3.tasks.find(t => t.id === 'L');

// At T=3, L executes. M(2) is ready. If L(3) was not boosted, M(2) would preempt.
// So if L runs at T=3, PIP worked. 
// We check if L ran. The priority log might be 3 if it reset at tick end, so we trust "RunningTaskId".

if (tick3.runningTaskId === 'L') {
    console.log(`\n[SUCCESS] PIP Verified: L ran at T=3 (preempting M via inheritance).`);
} else {
    console.log(`\n[FAILED] PIP Verification: At T=3, Running=${tick3.runningTaskId} (Expected L).`);
}
