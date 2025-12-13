import { Scheduler } from './modules/Scheduler.js';
import { Task } from './modules/Task.js';
import { Resource } from './modules/Resource.js';
import { Renderer } from './modules/Renderer.js';

const sched = new Scheduler();
const renderer = new Renderer('simCanvas');

// Initial Setup
const runBtn = document.getElementById('runBtn');
const resetBtn = document.getElementById('resetBtn');
const demoBtn = document.getElementById('demoBtn');
const taskForm = document.getElementById('taskForm');
const resourceForm = document.getElementById('resourceForm');
const statusInd = document.getElementById('statusIndicator');

// Event Listeners
runBtn.addEventListener('click', runSimulation);
resetBtn.addEventListener('click', resetSimulation);
if (demoBtn) demoBtn.addEventListener('click', openScenarioModal);
taskForm.addEventListener('submit', handleAddTask);
resourceForm.addEventListener('submit', handleAddResource); // This handles "Add Lock" but we might need to change it to "Add Instruction" or just log it? keeping for legacy or partial support

// Modal Elements
const modal = document.getElementById('scenarioModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const scenarioRMSBtn = document.getElementById('scenarioRMS');
const scenarioInversionBtn = document.getElementById('scenarioInversion');
const scenarioDeadlockBtn = document.getElementById('scenarioDeadlock');

// Modal Listeners
if (closeModalBtn) closeModalBtn.addEventListener('click', closeScenarioModal);
if (scenarioRMSBtn) scenarioRMSBtn.addEventListener('click', () => { loadSimpleRMS(); closeScenarioModal(); });
if (scenarioInversionBtn) scenarioInversionBtn.addEventListener('click', () => { loadPriorityInversion(); closeScenarioModal(); });
if (scenarioDeadlockBtn) scenarioDeadlockBtn.addEventListener('click', () => { loadDeadlock(); closeScenarioModal(); });

function openScenarioModal() {
    if (modal) modal.style.display = 'flex';
}

function closeScenarioModal() {
    if (modal) modal.style.display = 'none';
}

function loadSimpleRMS() {
    resetSimulation();
    // Task 1: T1, P20, C5, Pri1
    // Instructions: COMPUTE(5)
    const t1 = new Task('T1', 20, 5, 0, [
        { type: 'COMPUTE', duration: 5 }
    ]);
    t1.color = '#9000ffff';
    sched.addTask(t1);

    // Task 2: T2, P40, C10, Pri2
    // Instructions: COMPUTE(10)
    const t2 = new Task('T2', 40, 10, 0, [
        { type: 'COMPUTE', duration: 10 }
    ]);
    t2.color = '#00fbffff';
    sched.addTask(t2);

    // Task 3: T3, P60, C5, Pri3
    // Instructions: COMPUTE(5)
    const t3 = new Task('T3', 60, 5, 0, [
        { type: 'COMPUTE', duration: 5 }
    ]);
    t3.color = '#eaff00ff';
    sched.addTask(t3);

    updateUI();
    console.log("Simple RMS Loaded");
}

function loadPriorityInversion() {
    resetSimulation();

    // T3: Low Priority (Longest Period = 20)
    // Starts first (Offset 0), grabs the lock.
    const tLow = new Task('T3', 20, 6, 0, [
        { type: 'COMPUTE', duration: 1 },
        { type: 'LOCK', target: 'R1' },
        { type: 'COMPUTE', duration: 4 }, // Holds lock for a while
        { type: 'UNLOCK', target: 'R1' },
        { type: 'COMPUTE', duration: 1 }
    ]);
    tLow.color = '#2ecc71';
    sched.addTask(tLow);

    // T2: Medium Priority (Medium Period = 15)
    // Arrives at t=3. MUST preempt T3 (because 15 < 20).
    const tMed = new Task('T2', 15, 4, 3, [
        { type: 'COMPUTE', duration: 4 }
    ]);
    tMed.color = '#f1c40f';
    sched.addTask(tMed);

    // T1: High Priority (Shortest Period = 10)
    // Arrives at t=4. Preempts T2.
    // Tries to lock R1 -> BLOCKS (held by T3).
    // This allows T2 (Medium) to resume, blocking T1 (High) indefinitely.
    const tHigh = new Task('T1', 10, 4, 4, [
        { type: 'LOCK', target: 'R1' },
        { type: 'COMPUTE', duration: 2 },
        { type: 'UNLOCK', target: 'R1' },
        { type: 'COMPUTE', duration: 2 }
    ]);
    tHigh.color = '#e74c3c';
    sched.addTask(tHigh);

    sched.addResource(new Resource('R1'));
    updateUI();

    alert("Priority Inversion Demo Loaded.\nRun with Protocol=NONE to see Inversion.\nRun with Protocol=PIP to see Inheritance.");
}

function loadDeadlock() {
    resetSimulation();

    // ---------------------------------------------------------
    // Scenario: Deadlock Setup
    // T2 (Low Prio): Holds CS2, wants CS1
    // T1 (High Prio): Holds CS1, wants CS2
    // ---------------------------------------------------------

    // TASK 2: Low Priority (Period 20)
    // Starts at t=0.
    // Logic: Runs a bit, locks CS2, then later tries to lock CS1.
    const t2 = new Task('T2', 20, 6, 0, [
        { type: 'COMPUTE', duration: 1 },    // Run for 1ms
        { type: 'LOCK', target: 'CS2' },     // Lock the first resource
        { type: 'COMPUTE', duration: 2 },    // Burn time so T1 can arrive and preempt us
        { type: 'LOCK', target: 'CS1' },     // Try to lock the second resource (Deadlock Trigger)
        { type: 'COMPUTE', duration: 1 },
        { type: 'UNLOCK', target: 'CS1' },
        { type: 'UNLOCK', target: 'CS2' }
    ]);
    t2.color = '#9b59b6'; // Purple
    sched.addTask(t2);

    // TASK 1: High Priority (Period 10)
    // Starts at t=2 (Offset).
    // Logic: Arrives AFTER T2 has already locked CS2.
    // Because P10 < P20, T1 immediately preempts T2 upon arrival.
    const t1 = new Task('T1', 10, 6, 2, [
        { type: 'LOCK', target: 'CS1' },     // Lock the resource T2 doesn't have yet
        { type: 'COMPUTE', duration: 1 },
        { type: 'LOCK', target: 'CS2' },     // Try to lock the resource T2 ALREADY has -> BLOCKS
        { type: 'COMPUTE', duration: 2 },
        { type: 'UNLOCK', target: 'CS2' },
        { type: 'UNLOCK', target: 'CS1' }
    ]);
    t1.color = '#e67e22'; // Orange
    sched.addTask(t1);

    // Resources
    // Note: Ceiling priority is 1 (Highest possible) for PCP
    sched.addResource(new Resource('CS1', 1));
    sched.addResource(new Resource('CS2', 1));

    updateUI();
    console.log("Deadlock Scenario Loaded: T2(Low) starts first. T1(High) arrives at t=2.");
    alert("Deadlock Scenario Loaded.\n\nExpected Behavior:\n1. T2 starts, locks CS2.\n2. T1 arrives (t=2), preempts T2, locks CS1.\n3. T1 tries for CS2 -> BLOCKED by T2.\n4. T2 resumes, tries for CS1 -> BLOCKED by T1.\n\nSystem halts.");
}

function handleAddTask(e) {
    e.preventDefault();
    const id = document.getElementById('taskId').value;
    const period = parseInt(document.getElementById('taskPeriod').value);
    const cost = parseInt(document.getElementById('taskCost').value);
    const offset = parseInt(document.getElementById('taskOffset').value);
    const prio = parseInt(document.getElementById('taskPrio').value); // Ignored in RMS, used for sorting check? No, used for base.
    const color = document.getElementById('taskColor').value;

    if (sched.tasks.find(t => t.id === id)) {
        alert("Task ID already exists!");
        return;
    }

    // Default Instruction: Just Compute
    const instructions = [{ type: 'COMPUTE', duration: cost }];

    // Logic: If we want to add locks via the other form, we need a way to push instructions?
    // For now, simpler to just add default task.

    const t = new Task(id, period, cost, offset, instructions);
    // Override calculate RMS priority?
    // t.basePriority = prio; // RMS force? 
    // Scheduler calculates base as period usually.
    // But let's allow manual override if UI provides it?
    // t.basePriority = prio; 

    t.color = color;

    sched.addTask(t);
    updateUI();
}

function handleAddResource(e) {
    e.preventDefault();
    // This form was "Add Lock". Since we moved to instruction streams,
    // we can't easily "append" a lock to a compiled instruction list without refactoring the UI flow.
    // WORKAROUND: We will append LOCK + COMPUTE + UNLOCK to the end of the instructions list?
    // Or just alert user "Use JSON config for complex scenarios".
    alert("To add complex locks, please write a JSON scenario. Basic UI only adds COMPUTE tasks.");
}

function runSimulation() {
    statusInd.className = 'status-ok';
    statusInd.textContent = 'Running...';
    sched.status = 'OK';

    // Get Protocols
    const radios = document.getElementsByName('protocol');
    let proto = 'NONE';
    for (let r of radios) if (r.checked) proto = r.value;

    sched.enablePIP = (proto === 'PIP');
    sched.enablePCP = (proto === 'PCP');

    // Auto-calculate hyperperiod or fixed duration
    let duration = sched.hyperperiod;
    if (duration === 0) duration = 50;
    if (duration > 150) duration = 150; // Safety Cap

    // Update Hyperperiod Display
    const hpEl = document.getElementById('hyperperiodVal');
    if (hpEl) hpEl.textContent = sched.hyperperiod;

    const history = sched.run(duration);

    renderer.draw(sched.tasks, history, duration);

    // Log output
    displayLog(history);

    if (sched.status === 'DEADLOCK') {
        statusInd.className = 'status-error';
        statusInd.textContent = 'DEADLOCK DETECTED';
        alert("Simulation stopped due to DEADLOCK.");
    } else {
        statusInd.textContent = 'System OK';
    }
}

function resetSimulation() {
    sched.tasks = [];
    sched.resources.clear();
    sched.reset();
    updateUI();
    // clear canvas
    const canvas = document.getElementById('simCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('logContent').innerHTML = '';
}

function updateUI() {
    // Update Task List
    const list = document.getElementById('taskList');
    list.innerHTML = sched.tasks.map(t => {
        // Show instructions summary
        let ops = t.instructions.length;
        return `
        <div class="task-item" style="border-left: 5px solid ${t.color}">
            <strong>${t.id}</strong> (P${t.period}, C${t.wcet})<br>
            <small>${ops} Ops</small>
        </div>
        `;
    }).join('');

    // Update Resource Select
    const sel = document.getElementById('resTaskSelect');
    sel.innerHTML = sched.tasks.map(t => `<option value="${t.id}">${t.id}</option>`).join('');
}

function displayLog(history) {
    const logDiv = document.getElementById('logContent');
    // Filter changes only? or full log?
    // Full log is cleaner for small duration.
    logDiv.innerHTML = history.map(h => {
        let run = h.runningTaskId || '-';
        // Add Deadlock note?
        return `<div class="log-entry">T=${h.time}: Run=${run} ${h.tasks.find(t => t.state === 'BLOCKED') ? '(BLOCKED)' : ''}</div>`;
    }).join('');
}

// Initial UI
updateUI();
