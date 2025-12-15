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
// New UI Elements
const addSegBtn = document.getElementById('btn-add-segment');
const segDuration = document.getElementById('seg-duration');
const resDropdownBtn = document.getElementById('btn-resources');
const resourceChecklist = document.getElementById('resource-dropdown');
const resourceListContainer = document.getElementById('resource-list-container');
const segmentList = document.getElementById('segment-list');
const taskSegmentsData = document.getElementById('taskSegmentsData');
const resCountBadge = document.getElementById('res-count');

const tabLinks = document.querySelectorAll('.tab-link');

let currentSegments = []; // Builder State

// Event Listeners
runBtn.addEventListener('click', runSimulation);
resetBtn.addEventListener('click', resetSimulation);
if (demoBtn) demoBtn.addEventListener('click', openScenarioModal);
taskForm.addEventListener('submit', handleAddTask);
resourceForm.addEventListener('submit', handleAddResource);

// New UI Listeners
// New UI Listeners
// New UI Listeners
if (addSegBtn) addSegBtn.addEventListener('click', handleAddSegment);

// Toggle Menu
if (resDropdownBtn && resourceChecklist) {
    resDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resourceChecklist.classList.toggle('hidden');
    });
}

// Close menu if clicking OUTSIDE of it
document.addEventListener('click', (e) => {
    if (resDropdownBtn && resourceChecklist && !resDropdownBtn.contains(e.target) && !resourceChecklist.contains(e.target)) {
        resourceChecklist.classList.add('hidden');
    }
});

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
    const t1 = new Task('T1', 20, 5, 0, [
        { duration: 5, resources: [] }
    ]);
    t1.color = '#9000ffff';
    sched.addTask(t1);

    // Task 2: T2, P40, C10, Pri2
    const t2 = new Task('T2', 40, 10, 0, [
        { duration: 10, resources: [] }
    ]);
    t2.color = '#00fbffff';
    sched.addTask(t2);

    // Task 3: T3, P60, C5, Pri3
    const t3 = new Task('T3', 60, 5, 0, [
        { duration: 5, resources: [] }
    ]);
    t3.color = '#eaff00ff';
    sched.addTask(t3);

    updateUI();
    console.log("Simple RMS Loaded");
}

function loadPriorityInversion() {
    resetSimulation();

    // T3: Low Priority (Longest Period = 20)
    // Segments: 1ms (None) -> 4ms (R1) -> 1ms (None)
    const tLow = new Task('T3', 20, 6, 0, [
        { duration: 1, resources: [] },
        { duration: 4, resources: ['R1'] },
        { duration: 1, resources: [] }
    ]);
    tLow.color = '#2ecc71';
    sched.addTask(tLow);

    // T2: Medium Priority (Medium Period = 15)
    // Segments: 4ms (None)
    const tMed = new Task('T2', 15, 4, 3, [
        { duration: 4, resources: [] }
    ]);
    tMed.color = '#f1c40f';
    sched.addTask(tMed);

    // T1: High Priority (Shortest Period = 10)
    // Segments: 0ms -> Needs R1 immediately? Or run 2ms then need R1?
    // Original: LOCK R1, COMPUTE 2, UNLOCK, COMPUTE 2.
    // Segment translation: Needs R1 for 2ms. Then free for 2ms.
    const tHigh = new Task('T1', 10, 4, 4, [
        { duration: 2, resources: ['R1'] },
        { duration: 2, resources: [] }
    ]);
    tHigh.color = '#e74c3c';
    sched.addTask(tHigh);

    sched.addResource(new Resource('R1'));
    updateUI();

    alert("Priority Inversion Demo Loaded.\nRun with Protocol=NONE to see Inversion.\nRun with Protocol=PIP to see Inheritance.");
}

function loadDeadlock() {
    resetSimulation();

    // TASK 2: Low Priority (Period 20)
    // Segments: 1ms [] -> 2ms [CS2] -> 1ms [CS1, CS2] (WAIT: Requires [CS2] then [CS1, CS2]?)
    // Original: LOCK CS2, CMP 2, LOCK CS1...
    // Correct Segment Logic for Deadlock:
    // 1. [0-1] None
    // 2. [1-3] Hold CS2 (2ms)
    // 3. [3-4] Hold CS2 + CS1 (1ms). (This step blocks if CS1 unavailable).
    // 4. [4-5] Hold CS2 + CS1 (UNLOCK CS1 implicitly by next segment only holding CS2?)
    // Actually, explicit UNLOCKs suggest:
    // Seg 1: 1ms []
    // Seg 2: 2ms [CS2]
    // Seg 3: 1ms [CS2, CS1]
    // Seg 4: 0ms [CS2]? Or just done?
    // Let's assume simplest deadlock structure:
    const t2 = new Task('T2', 20, 4, 0, [
        { duration: 1, resources: [] },
        { duration: 2, resources: ['CS2'] },
        { duration: 1, resources: ['CS2', 'CS1'] }
    ]);
    t2.color = '#9b59b6'; // Purple
    sched.addTask(t2);

    // TASK 1: High Priority (Period 10)
    // Arrives T=2.
    // 1. [0-1] Hold CS1.
    // 2. [1-3] Hold CS1 + CS2.
    const t1 = new Task('T1', 10, 3, 2, [
        { duration: 1, resources: ['CS1'] },
        { duration: 2, resources: ['CS1', 'CS2'] }
    ]);
    t1.color = '#e67e22'; // Orange
    sched.addTask(t1);

    sched.addResource(new Resource('CS1', 1));
    sched.addResource(new Resource('CS2', 1));

    updateUI();
    console.log("Deadlock Scenario Loaded");
    alert("Deadlock Scenario Loaded.\n\nT2 holds CS2, wants CS1.\nT1 holds CS1, wants CS2.\n\nClassic Circular Wait.");
}

function handleAddTask(e) {
    e.preventDefault();
    const id = document.getElementById('taskId').value;
    const period = parseInt(document.getElementById('taskPeriod').value);
    const offset = parseInt(document.getElementById('taskOffset').value);
    const color = document.getElementById('taskColor').value;

    if (sched.tasks.find(t => t.id === id)) {
        alert("Task ID already exists!");
        return;
    }

    if (currentSegments.length === 0) {
        alert("Please add at least one execution segment!");
        return;
    }

    // Calculate generic Cost (WCET) for display
    let totalCost = currentSegments.reduce((sum, seg) => sum + seg.duration, 0);

    const t = new Task(id, period, totalCost, offset, [...currentSegments]);
    t.color = color;

    sched.addTask(t);

    // Reset Form & Builder
    currentSegments = [];
    renderSegmentsPreview();
    updateUI();
}

function updateResourceDropdown() {
    resourceListContainer.innerHTML = '';

    if (sched.resources.size === 0) {
        resourceListContainer.innerHTML = '<div class="empty-msg">No resources defined. Add below.</div>';
        return;
    }

    sched.resources.forEach((res, id) => {
        const option = document.createElement('div'); // Changed from label to div
        option.className = 'res-option';
        option.dataset.value = id; // Store ID in data attribute
        option.innerHTML = `
            ${id} (Priority Ceiling: ${res.ceilingPriority})
        `;

        // Click to toggle selection
        option.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent closing menu
            option.classList.toggle('selected');
            updateBadgeCount();
        });

        resourceListContainer.appendChild(option);
    });
    updateBadgeCount();
}

function updateBadgeCount() {
    const selected = resourceListContainer.querySelectorAll('.res-option.selected');
    if (resCountBadge) resCountBadge.textContent = selected.length;
}

function handleAddSegment() {
    const dur = parseInt(segDuration.value);
    if (isNaN(dur) || dur <= 0) {
        alert("Duration must be a positive integer");
        return;
    }

    // Get checked resources (from .selected class)
    const checked = [];
    const selectedOptions = resourceListContainer.querySelectorAll('.res-option.selected');
    selectedOptions.forEach(opt => {
        checked.push(opt.dataset.value);
    });

    const seg = { duration: dur, resources: checked };
    currentSegments.push(seg);

    // Reset inputs
    segDuration.value = '';

    // Clear selections
    selectedOptions.forEach(opt => opt.classList.remove('selected'));
    updateBadgeCount();

    resourceChecklist.classList.add('hidden'); // Close menu

    renderSegmentsPreview();
}

function renderSegmentsPreview() {
    if (currentSegments.length === 0) {
        segmentList.innerHTML = '<li style="color: #999; font-style: italic; text-align: center;">No segments added</li>';
        taskSegmentsData.value = '[]';
        return;
    }

    segmentList.innerHTML = currentSegments.map((seg, idx) => {
        const resStr = seg.resources.length > 0 ? `[${seg.resources.join(',')}]` : '';

        return `<div class="segment-item">
            <span>${idx + 1}. ⏱️ ${seg.duration}ms ${resStr}</span>
            <span class="remove-op" onclick="removeOp(${idx})">✖</span>
        </div>`;
    }).join('');

    taskSegmentsData.value = JSON.stringify(currentSegments);
}

window.removeOp = function (idx) {
    currentSegments.splice(idx, 1);
    renderSegmentsPreview();
};

function handleAddResource(e) {
    e.preventDefault();

    const id = document.getElementById('resId').value.trim();
    if (!id) return;

    const ceiling = parseInt(document.getElementById('resCeiling').value);

    // Check availability
    if (sched.resources.has(id)) {
        alert(`Resource ${id} already exists!`);
        return;
    }

    const res = new Resource(id, ceiling);
    sched.addResource(res);

    // Update UI
    document.getElementById('resId').value = '';
    updateUI();
    // If builder is active, refresh dropdown
    updateResourceDropdown();
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
    // Legacy Task List removed from Sidebar.
    // Tasks are now viewed in the bottom panel tabs.

    // Update Resource Select - NO LONGER NEEDED (Form Removed)
    // But we might want to update potential other lists?

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
        const flow = t.segments.map(seg => {
            const res = seg.resources.length > 0 ? `🔒{${seg.resources.join(',')}}` : '';
            return `<span class="badge badge-compute">${seg.duration}ms ${res}</span>`;
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
