import { Task } from '../modules/Task.js';
import { Resource } from '../modules/Resource.js';
import { Scheduler } from '../modules/Scheduler.js';

const sched = new Scheduler();
sched.enablePIP = true;

const R1 = new Resource('R1');
sched.addResource(R1);

console.log("Running Mars Pathfinder PIP Scenario...");

// ---------------------------------------------------------
// Task L (Low Priority 3)
// Starts t=0. Total WCET=6.
// Logic: Needs R1 immediately for 4 ticks, then computes for 2.
// ---------------------------------------------------------
// Segments:
// 1. [0-4ms] Hold R1 (Duration 4)
// 2. [4-6ms] Compute (Duration 2)
const taskL = new Task('L', 20, 6, 0, [
    { duration: 4, resources: ['R1'] },
    { duration: 2, resources: [] }
]);
// Manually override RMS priority to match scenario (Low=3)
taskL.basePriority = 3;
taskL.currentPriority = 3;

// ---------------------------------------------------------
// Task H (High Priority 1)
// Starts t=2. Total WCET=3.
// Logic: Needs R1 immediately upon arrival for 2 ticks.
// ---------------------------------------------------------
// Segments:
// 1. [0-2ms] Hold R1 (Duration 2)
// 2. [2-3ms] Compute (Duration 1)
const taskH = new Task('H', 20, 3, 2, [
    { duration: 2, resources: ['R1'] },
    { duration: 1, resources: [] }
]);
taskH.basePriority = 1;
taskH.currentPriority = 1;

// ---------------------------------------------------------
// Task M (Medium Priority 2)
// Starts t=3. Total WCET=4.
// Logic: Just noise. No resources.
// ---------------------------------------------------------
// Segments:
// 1. [0-4ms] Compute (Duration 4)
const taskM = new Task('M', 20, 4, 3, [
    { duration: 4, resources: [] }
]);
taskM.basePriority = 2;
taskM.currentPriority = 2;

sched.addTask(taskH);
sched.addTask(taskM);
sched.addTask(taskL);

const history = sched.run(15);

// ---------------------------------------------------------
// Visualization Log
// ---------------------------------------------------------
console.log("Time | Run | L(Prio) | H(State) | M(State)");
history.forEach(tick => {
    let l = tick.tasks.find(t => t.id === 'L');
    let h = tick.tasks.find(t => t.id === 'H');
    let m = tick.tasks.find(t => t.id === 'M');

    // Safe state access
    const hState = h ? h.state.substring(0, 4) : '____';
    const mState = m ? m.state.substring(0, 4) : '____';

    console.log(`${tick.time.toString().padEnd(4)} | ${tick.runningTaskId || '_'}   | L:${l.prio}      | H:${hState} | M:${mState}`);
});

// ---------------------------------------------------------
// Verification Logic
// ---------------------------------------------------------
// T=0: L runs (locks R1).
// T=2: H arrives. Preempts L? 
//      H tries to lock R1. Fails (Held by L).
//      H Blocks. 
//      *** PIP TRIGGER *** -> L inherits H's priority (1).
// T=3: M arrives (Prio 2).
//      Comparison: M(2) vs L(1 - inherited).
//      L is higher priority. L continues running.
//      (Without PIP, M(2) > L(3), so M would run, causing Inversion).

const tick3 = history.find(h => h.time === 3);

if (tick3 && tick3.runningTaskId === 'L') {
    const l_prio = tick3.tasks.find(t => t.id === 'L').prio;
    console.log(`\n[SUCCESS] PIP Verified: L ran at T=3.`);
    console.log(`          Inheritance Check: L Priority was ${l_prio} (Expected 1).`);
} else {
    console.log(`\n[FAILED] PIP Verification: At T=3, Running=${tick3 ? tick3.runningTaskId : 'None'} (Expected L).`);
    console.log("          Note: If M ran, Priority Inversion occurred.");
}