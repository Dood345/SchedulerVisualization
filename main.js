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

// New UI Elements
const addOpBtn = document.getElementById('addOpBtn');
const opTypeSel = document.getElementById('opType');
const opValIn = document.getElementById('opVal');
const newOpsList = document.getElementById('newOpsList');
const tabLinks = document.querySelectorAll('.tab-link');

let currentInstructions = []; // Builder State

// Event Listeners
runBtn.addEventListener('click', runSimulation);
resetBtn.addEventListener('click', resetSimulation);
if (demoBtn) demoBtn.addEventListener('click', openScenarioModal);
taskForm.addEventListener('submit', handleAddTask);
resourceForm.addEventListener('submit', handleAddResource);

// New UI Listeners
if (addOpBtn) addOpBtn.addEventListener('click', handleAddOp);

tabLinks.forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Deactivate all
        document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        // Activate clicked
        e.target.classList.add('active');
        const tabId = e.target.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
    });
});

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
    const offset = parseInt(document.getElementById('taskOffset').value);
    // Cost input is gone, used in builder
    const color = document.getElementById('taskColor').value;

    if (sched.tasks.find(t => t.id === id)) {
        alert("Task ID already exists!");
        return;
    }

    if (currentInstructions.length === 0) {
        alert("Please add at least one execution step (Instruction)!");
        return;
    }

    // Validate: Cannot end holding a lock
    let locksHeld = 0;
    for (let op of currentInstructions) {
        if (op.type === 'LOCK') locksHeld++;
        if (op.type === 'UNLOCK') locksHeld--;
    }
    if (locksHeld !== 0) {
        alert("Warning: Task definition ends with locks still held! This may cause issues.");
        // We allow it, but warn.
    }

    // Calculate generic Cost (WCET) for display
    let totalCost = currentInstructions.reduce((sum, op) => op.type === 'COMPUTE' ? sum + op.duration : sum, 0);

    const t = new Task(id, period, totalCost, offset, [...currentInstructions]); // Copy instructions
    t.color = color;

    sched.addTask(t);

    // Reset Form & Builder
    currentInstructions = [];
    renderOpsPreview();
    // Optional: Auto-increment ID?
    updateUI();
}

function handleAddOp() {
    const type = opTypeSel.value;
    const val = opValIn.value.trim();

    if (!val) return;

    let op = { type: type };

    if (type === 'COMPUTE') {
        const dur = parseInt(val);
        if (isNaN(dur) || dur <= 0) {
            alert("Duration must be a positive integer");
            return;
        }
        op.duration = dur;
    } else {
        // LOCK/UNLOCK
        if (!val) {
            alert("Resource ID required");
            return;
        }
        op.target = val;
    }

    currentInstructions.push(op);
    opValIn.value = ''; // Clear input
    opValIn.focus();
    renderOpsPreview();
}

function renderOpsPreview() {
    if (currentInstructions.length === 0) {
        newOpsList.innerHTML = '<li style="color: #999; font-style: italic; text-align: center;">No steps added</li>';
        return;
    }

    newOpsList.innerHTML = currentInstructions.map((op, idx) => {
        let txt = '';
        if (op.type === 'COMPUTE') txt = `⚙️ Compute (${op.duration})`;
        if (op.type === 'LOCK') txt = `🔒 Lock ${op.target}`;
        if (op.type === 'UNLOCK') txt = `🔓 Unlock ${op.target}`;

        return `<li>
            <span>${idx + 1}. ${txt}</span>
            <span class="remove-op" onclick="removeOp(${idx})">✖</span>
        </li>`;
    }).join('');
}

window.removeOp = function (idx) {
    currentInstructions.splice(idx, 1);
    renderOpsPreview();
};

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
    // Update Resource Select
    const sel = document.getElementById('resTaskSelect');
    if (sel) sel.innerHTML = sched.tasks.map(t => `<option value="${t.id}">${t.id}</option>`).join('');

    // Update Tabs
    renderTaskDetails();
    renderResourceStatus();
}

function renderTaskDetails() {
    const container = document.getElementById('taskDetailsTab');
    if (!container) return;

    if (sched.tasks.length === 0) {
        container.innerHTML = '<p class="hint" style="text-align: center; margin-top: 20px;">Add tasks to see their instruction pipeline here.</p>';
        return;
    }

    container.innerHTML = sched.tasks.map(t => {
        const flow = t.instructions.map(op => {
            if (op.type === 'COMPUTE') return `<span class="badge badge-compute">⚙️ ${op.duration}</span>`;
            if (op.type === 'LOCK') return `<span class="badge badge-lock">🔒 ${op.target}</span>`;
            if (op.type === 'UNLOCK') return `<span class="badge badge-unlock">🔓 ${op.target}</span>`;
        }).join('<span class="arrow">→</span>');

        return `
        <div class="task-spec-card" style="border-left: 4px solid ${t.color}">
            <div class="spec-header">
                <strong>${t.id}</strong> 
                <span class="text-muted">P: ${t.period} | Offset: ${t.offset} | WCET: ${t.wcet}</span>
            </div>
            <div class="spec-flow">${flow}</div>
        </div>`;
    }).join('');
}

function renderResourceStatus() {
    const container = document.getElementById('resourceStatusTab');
    if (!container) return;

    // We need to inspect the scheduler resources.
    // The simplified Scheduler.js might not expose "Resource objects" in a single array unless we track them.
    // sched.resources is a Map.

    if (sched.resources.size === 0) {
        container.innerHTML = '<p class="hint">No resources known.</p>';
        return;
    }

    let rows = '';
    sched.resources.forEach((res, id) => {
        let owner = res.owner ? `<strong>${res.owner.id}</strong>` : '<span style="color:#aaa">-</span>';
        let blocked = res.blockedQueue.length > 0 ? res.blockedQueue.map(t => t.id).join(', ') : '-';
        let ceiling = res.ceilingPriority < 999999 ? res.ceilingPriority : 'N/A';

        rows += `<tr>
            <td>${id}</td>
            <td>${owner}</td>
            <td>${blocked}</td>
            <td>${ceiling}</td>
        </tr>`;
    });

    container.innerHTML = `
        <table class="res-table">
            <thead>
                <tr>
                    <th>Resource ID</th>
                    <th>Current Owner</th>
                    <th>Blocked Queue</th>
                    <th>PCP Ceiling</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
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
