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
const pipToggle = document.getElementById('pipToggle');
const statusInd = document.getElementById('statusIndicator');

// Event Listeners
runBtn.addEventListener('click', runSimulation);
resetBtn.addEventListener('click', resetSimulation);
if (demoBtn) demoBtn.addEventListener('click', openScenarioModal);
taskForm.addEventListener('submit', handleAddTask);
resourceForm.addEventListener('submit', handleAddResource);

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
    sched.addTask(new Task('T1', 20, 5, 0));
    let t1 = sched.tasks[0]; t1.basePriority = 1; t1.currentPriority = 1; t1.color = '#9000ffff';

    // Task 2: T2, P40, C10, Pri2
    sched.addTask(new Task('T2', 40, 10, 0));
    let t2 = sched.tasks[1]; t2.basePriority = 2; t2.currentPriority = 2; t2.color = '#00fbffff';

    // Task 3: T3, P60, C5, Pri3
    sched.addTask(new Task('T3', 60, 5, 0));
    let t3 = sched.tasks[2]; t3.basePriority = 3; t3.currentPriority = 3; t3.color = '#eaff00ff';

    updateUI();
    console.log("Simple RMS Loaded");
}

function loadPriorityInversion() {
    resetSimulation();
    // Low Priority Task (T3) - Holds Resource
    // T3: P=20, C=6, Pri=3. Uses R1 for 4s starting at t=1.
    sched.addTask(new Task('T_Low', 20, 6, 0));
    let t3 = sched.tasks[0]; t3.basePriority = 3; t3.currentPriority = 3; t3.color = '#2ecc71'; // Green

    // Medium Priority Task (T2) - CPU Heavy, preemption Noise
    // T2: P=20, C=4, Pri=2. Starts after T3 acquires lock but before it finishes.
    // Offset=2 to preempt T3 inside critical section
    sched.addTask(new Task('T_Med', 20, 4, 3));
    let t2 = sched.tasks[1]; t2.basePriority = 2; t2.currentPriority = 2; t2.color = '#f1c40f'; // Yellow

    // High Priority Task (T1) - Needs Resource held by T3
    // T1: P=20, C=4, Pri=1. Starts at 4, needs R1.
    sched.addTask(new Task('T_High', 20, 4, 4));
    let t1 = sched.tasks[2]; t1.basePriority = 1; t1.currentPriority = 1; t1.color = '#e74c3c'; // Red

    // Setup Resources
    sched.addResource(new Resource('R1'));

    // T_Low requests R1: Start=1, Duration=4 (occupies 1-5 if uninterrupted)
    t3.addResourceRequest('R1', 1, 4);

    // T_High requests R1: Start=1, Duration=2 (relative to its start time 4, so absolute ~5)
    // Actually requests relative to task execution. 
    // If T_High starts at 4, and needs R1 immediately:
    t1.addResourceRequest('R1', 0, 2);

    updateUI();
    alert("Priority Inversion Demo Loaded.\nRun with Protocol=NONE to see Inversion.\nRun with Protocol=PIP to see Inheritance.");
}

function loadDeadlock() {
    resetSimulation();

    // Task A: P20, C=6. Needs R1 then R2.
    sched.addTask(new Task('TaskA', 30, 8, 0));
    let ta = sched.tasks[0]; ta.basePriority = 1; ta.currentPriority = 1; ta.color = '#e67e22';

    // Task B: P20, C=6. Needs R2 then R1.
    sched.addTask(new Task('TaskB', 30, 8, 2)); // Offset 2 to interleave
    let tb = sched.tasks[1]; tb.basePriority = 2; tb.currentPriority = 2; tb.color = '#9b59b6';

    sched.addResource(new Resource('R1'));
    sched.addResource(new Resource('R2'));

    // Nested Locks
    // Task A: Lock R1 at 1 for 6s. Inside, Lock R2 at 3 for 2s.
    ta.addResourceRequest('R1', 1, 6);
    ta.addResourceRequest('R2', 3, 2);

    // Task B: Lock R2 at 1 for 6s. Inside, Lock R1 at 3 for 2s.
    tb.addResourceRequest('R2', 1, 6);
    tb.addResourceRequest('R1', 3, 2);

    updateUI();
    alert("Deadlock Demo Loaded.\nRun with Protocol=NONE to see Deadlock.\nRun with Protocol=PCP to prevent it.");
}

function handleAddTask(e) {
    e.preventDefault();
    const id = document.getElementById('taskId').value;
    const period = parseInt(document.getElementById('taskPeriod').value);
    const cost = parseInt(document.getElementById('taskCost').value);
    const offset = parseInt(document.getElementById('taskOffset').value);
    const prio = parseInt(document.getElementById('taskPrio').value);
    const color = document.getElementById('taskColor').value;

    if (sched.tasks.find(t => t.id === id)) {
        alert("Task ID already exists!");
        return;
    }

    const t = new Task(id, period, cost, offset);
    t.basePriority = prio;
    t.currentPriority = prio;
    t.color = color;

    sched.addTask(t);
    updateUI();
}

function handleAddResource(e) {
    e.preventDefault();
    const taskId = document.getElementById('resTaskSelect').value;
    const resId = document.getElementById('resId').value;
    const start = parseInt(document.getElementById('resStart').value);
    const duration = parseInt(document.getElementById('resDuration').value);

    // Ensure resource exists in scheduler
    if (!sched.resources.has(resId)) {
        sched.addResource(new Resource(resId));
    }

    const task = sched.tasks.find(t => t.id === taskId);
    if (task) {
        task.addResourceRequest(resId, start, duration);
        alert(`Request added: ${taskId} needs ${resId} at ${start} for ${duration}s`);
    }
}

function runSimulation() {
    statusInd.className = 'status-ok';
    statusInd.textContent = 'Running...';
    sched.status = 'OK';

    // Auto-calculate hyperperiod or fixed duration
    let duration = sched.hyperperiod;
    if (duration === 0) duration = 50;
    // if (duration > 100) duration = 100; // Limit

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
    list.innerHTML = sched.tasks.map(t => `
        <div class="task-item" style="border-left: 5px solid ${t.color}">
            <strong>${t.id}</strong> (P${t.period}, C${t.cost}, Pri${t.basePriority})
        </div>
    `).join('');

    // Update Resource Select
    const sel = document.getElementById('resTaskSelect');
    sel.innerHTML = sched.tasks.map(t => `<option value="${t.id}">${t.id}</option>`).join('');
}

function displayLog(history) {
    const logDiv = document.getElementById('logContent');
    logDiv.innerHTML = history.map(h => {
        let run = h.runningTaskId || '-';
        return `<div class="log-entry">T=${h.time}: Run=${run}</div>`;
    }).join('');
}

// Initial UI
updateUI();
