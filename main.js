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
if (demoBtn) demoBtn.addEventListener('click', loadDemo);
taskForm.addEventListener('submit', handleAddTask);
resourceForm.addEventListener('submit', handleAddResource);

// Handle Protocol Selection
document.querySelectorAll('input[name="protocol"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const val = e.target.value;
        sched.enablePIP = (val === 'PIP' || val === 'PCP');
        sched.enablePCP = (val === 'PCP');
        console.log(`Protocol set to: ${val}`);
    });
});

function loadDemo() {
    resetSimulation();
    // Task 1: T1, P20, C5, Pri1
    sched.addTask(new Task('T1', 20, 5, 0));
    let t1 = sched.tasks[0]; t1.basePriority = 1; t1.currentPriority = 1; t1.color = '#3498db';

    // Task 2: T2, P40, C10, Pri2
    sched.addTask(new Task('T2', 40, 10, 0));
    let t2 = sched.tasks[1]; t2.basePriority = 2; t2.currentPriority = 2; t2.color = '#e74c3c';

    // Task 3: T3, P60, C5, Pri3
    sched.addTask(new Task('T3', 60, 5, 0));
    let t3 = sched.tasks[2]; t3.basePriority = 3; t3.currentPriority = 3; t3.color = '#2ecc71';

    updateUI();
    alert("Demo Tasks Loaded (T1, T2, T3)");
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
