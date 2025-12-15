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
const scenarioOverloadBtn = document.getElementById('scenarioOverload');

// Modal Listeners
if (closeModalBtn) closeModalBtn.addEventListener('click', closeScenarioModal);
if (scenarioRMSBtn) scenarioRMSBtn.addEventListener('click', () => { loadSimpleRMS(); closeScenarioModal(); });
if (scenarioInversionBtn) scenarioInversionBtn.addEventListener('click', () => { loadPriorityInversion(); closeScenarioModal(); });
if (scenarioDeadlockBtn) scenarioDeadlockBtn.addEventListener('click', () => { loadDeadlock(); closeScenarioModal(); });
if (scenarioOverloadBtn) scenarioOverloadBtn.addEventListener('click', () => { loadOverloadDeadlock(); closeScenarioModal(); });

function openScenarioModal() {
    if (modal) modal.style.display = 'flex';
}

function closeScenarioModal() {
    if (modal) modal.style.display = 'none';
}

function loadSimpleRMS() {
    resetSimulation();
    // Task 1: T1, P8, C4, Pri1
    const t1 = new Task('T1', 8, 4, 0, [
        { duration: 4, resources: [] }
    ]);
    t1.color = '#9000ffff';
    sched.addTask(t1);

    // Task 2: T2, P16, C4, Pri2
    const t2 = new Task('T2', 16, 4, 0, [
        { duration: 4, resources: [] }
    ]);
    t2.color = '#00fbffff';
    sched.addTask(t2);

    // Task 3: T3, P32, C8, Pri3
    const t3 = new Task('T3', 32, 8, 0, [
        { duration: 8, resources: [] }
    ]);
    t3.color = '#eaff00ff';
    sched.addTask(t3);

    updateUI();
    console.log("Simple RMS Loaded");
}

function loadPriorityInversion() {
    resetSimulation();

    // T1: med Priority (Shortest Period = 16)
    // Segments: 4ms (None)
    const tMed = new Task('T1', 16, 4, 0, [
        { duration: 4, resources: [] }
    ]);
    tMed.color = '#f1c40f';
    sched.addTask(tMed);

    // T2: High Priority (Medium Period = 12)
    // Segments: 2ms (None) -> 2ms (R1) -> 2ms (None)
    const tHigh = new Task('T2', 12, 4, 0, [
        { duration: 2, resources: [] },
        { duration: 2, resources: ['R1'] }
    ]);
    tHigh.color = '#e74c3c';
    sched.addTask(tHigh);

    // T3: Low Priority (Longest Period = 24)
    // Segments: 1ms (None) -> 4ms (R1) -> 1ms (None)
    const tLow = new Task('T3', 24, 8, 0, [
        { duration: 2, resources: [] },
        { duration: 6, resources: ['R1'] }
    ]);
    tLow.color = '#2ecc71';
    sched.addTask(tLow);

    sched.addResource(new Resource('R1'));
    updateUI();

    alert("Priority Inversion Demo Loaded.\nRun with Protocol=NONE to see Inversion.\nRun with Protocol=PIP to see Inheritance.");
}

function loadDeadlock() {
    console.log("Loading Deadlock Test Scenario...");
    resetSimulation();

    // 2. Define Resources
    // We manually register them so they exist even before tasks run.
    // Priorities (for PCP): 1=High, 3=Low.
    // CS1 & CS3 are used by T3 (High), so Ceiling = 1.
    // CS2 is used by T2 (Med), so Ceiling = 2.
    const resources = [
        { id: 'CS1', ceilingPriority: 1 },
        { id: 'CS2', ceilingPriority: 2 },
        { id: 'CS3', ceilingPriority: 1 }
    ];

    resources.forEach(r => {
        sched.addResource(new Resource(r.id, r.ceilingPriority));
    });

    // 3. Define Tasks
    // Note: basePriority 1 is Highest, 3 is Lowest.

    // --- Task 1 (Low Priority) ---
    // Timeline: Starts t=0. Locks CS1 at t=0. Tries CS3 at t=5.
    const t1 = new Task('T1', 30, 10, 0, [
        { duration: 1, resources: ['CS1'] },       // t1-t8: Hold CS1 (Preempted often)
        { duration: 1, resources: ['CS1', 'CS2'] } // t8: Needs CS3 while holding CS1
    ]);
    t1.basePriority = 3;
    t1.color = '#eebb55'; // Orange
    sched.addTask(t1);

    // --- Task 2 (Medium Priority) ---
    // Timeline: Starts t=1. Locks CS2 at t=1. Tries CS3 at t=4.
    const t2 = new Task('T2', 20, 8, 1, [
        { duration: 1, resources: ['CS2'] },       // t3-t7: Hold CS2
        { duration: 1, resources: ['CS2', 'CS3'] } // t7: Needs CS3 while holding CS2
    ]);
    t2.basePriority = 2;
    t2.color = '#5599ff'; // Blue
    sched.addTask(t2);

    // --- Task 3 (High Priority) ---
    // Timeline: Starts t=2. Locks CS3 at t=2. Tries CS1 at t=3.
    const t3 = new Task('T3', 10, 4, 2, [
        { duration: 1, resources: ['CS3'] },       // t5-t6: Hold CS3
        { duration: 1, resources: ['CS3', 'CS1'] } // t6: Needs CS1 while holding CS3
    ]);
    t3.basePriority = 1;
    t3.color = '#dd5555'; // Red
    sched.addTask(t3);

    updateUI();
    console.log("Deadlock Scenario Loaded");
    alert("Complex Deadlock Scenario Loaded.\n\nT1 (Low) holds CS1, wants CS3.\nT2 (Med) holds CS2, wants CS3.\nT3 (High) holds CS3, wants CS1.\n\nDemonstrates chained blocking and circular wait.");
}

function loadOverloadDeadlock() {
    console.log("Loading Deadlock Test Scenario...");
    resetSimulation();

    // 2. Define Resources
    // We manually register them so they exist even before tasks run.
    // Priorities (for PCP): 1=High, 3=Low.
    // CS1 & CS3 are used by T3 (High), so Ceiling = 1.
    // CS2 is used by T2 (Med), so Ceiling = 2.
    const resources = [
        { id: 'CS1', ceilingPriority: 1 },
        { id: 'CS2', ceilingPriority: 2 },
        { id: 'CS3', ceilingPriority: 1 }
    ];

    resources.forEach(r => {
        sched.addResource(new Resource(r.id, r.ceilingPriority));
    });

    // 3. Define Tasks
    // Note: basePriority 1 is Highest, 3 is Lowest.

    // --- Task 1 (Low Priority) ---
    // Timeline: Starts t=0. Locks CS1 at t=1. Tries CS3 at t=8.
    const t1 = new Task('T1', 30, 10, 0, [
        { duration: 1, resources: [] },                           // t0-t1: Free
        { duration: 7, resources: ['CS1'] },       // t1-t8: Hold CS1 (Preempted often)
        { duration: 2, resources: ['CS1', 'CS3'] } // t8: Needs CS3 while holding CS1
    ]);
    t1.basePriority = 3;
    t1.color = '#eebb55'; // Orange
    sched.addTask(t1);

    // --- Task 2 (Medium Priority) ---
    // Timeline: Starts t=2. Locks CS2 at t=3. Tries CS3 at t=7.
    const t2 = new Task('T2', 20, 8, 2, [
        { duration: 1, resources: [] },                           // t2-t3: Free
        { duration: 4, resources: ['CS2'] },       // t3-t7: Hold CS2
        { duration: 2, resources: ['CS2', 'CS3'] } // t7: Needs CS3 while holding CS2
    ]);
    t2.basePriority = 2;
    t2.color = '#5599ff'; // Blue
    sched.addTask(t2);

    // --- Task 3 (High Priority) ---
    // Timeline: Starts t=4. Locks CS3 at t=5. Tries CS1 at t=6.
    const t3 = new Task('T3', 10, 4, 4, [
        { duration: 1, resources: [] },                           // t4-t5: Free
        { duration: 1, resources: ['CS3'] },       // t5-t6: Hold CS3
        { duration: 2, resources: ['CS3', 'CS1'] } // t6: Needs CS1 while holding CS3
    ]);
    t3.basePriority = 1;
    t3.color = '#dd5555'; // Red
    sched.addTask(t3);

    updateUI();
    console.log("Deadlock Scenario Loaded");
    alert("Complex Deadlock Scenario Loaded.\n\nT1 (Low) holds CS1, wants CS3.\nT2 (Med) holds CS2, wants CS3.\nT3 (High) holds CS3, wants CS1.\n\nDemonstrates chained blocking and circular wait.");
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
    renderSmartLog(history, sched.resources);

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
        // Generate Segment Chain
        const flow = t.segments.map((seg, idx) => {
            const res = seg.resources.length > 0 ? `🔒{${seg.resources.join(',')}}` : '';
            return `<span class="badge badge-compute">${seg.duration}ms ${res}</span>`;
        }).join('<span class="arrow-separator">➔</span>');

        // New Card Layout
        return `
        <div class="task-def-card" style="--task-color: ${t.color}">
            <div class="task-card-header">
                <span class="task-id-badge">${t.id}</span> 
                <span class="task-params">P: ${t.period} | Offset: ${t.offset} | WCET: ${t.wcet}</span>
            </div>
            <div class="task-segment-chain">
                ${flow}
            </div>
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

// Replaces displayLog
// Replaces displayLog
function renderSmartLog(history, resourcesMap) {
    const logContainer = document.getElementById('logContent');
    logContainer.innerHTML = ''; // Clear old logs

    if (!history || history.length === 0) return;

    let previousRunId = null;
    let consecutiveIdle = 0;
    let previousSnapshot = null; // To track priority changes

    history.forEach((tickData, index) => {
        const time = tickData.time;
        const runId = tickData.runningTaskId;
        const currentSnapshot = tickData.tasks;

        // Find the full task object for the running task
        const runningTaskSnap = runId ? currentSnapshot.find(t => t.id === runId) : null;

        // --- 1. SCAN TASKS (Priority, Blocking, Deadlock) ---
        currentSnapshot.forEach(currTask => {
            // Find this task in the previous tick
            const prevTask = previousSnapshot ? previousSnapshot.find(t => t.id === currTask.id) : null;

            // A. Priority Inheritance
            if (currTask.isPriorityBoosted) {
                // Only log if it CHANGED state (wasn't boosted before OR priority value changed)
                if (!prevTask || !prevTask.isPriorityBoosted || prevTask.prio !== currTask.prio) {
                    printLogLine(logContainer, time,
                        `<strong>Priority Inheritance:</strong> ${currTask.id} boosted to priority ${currTask.prio} (inherited).`,
                        "gold");
                }
            } else {
                // Check if it just dropped back to normal (released inheritance)
                if (prevTask && prevTask.isPriorityBoosted) {
                    printLogLine(logContainer, time,
                        `Priority Restore: ${currTask.id} returned to base priority ${currTask.basePrio}.`,
                        "gray");
                }
            }

            // B. Blocking Detection (Transition to BLOCKED)
            // Log when a task *becomes* blocked
            if (currTask.state === 'BLOCKED') {
                if (!prevTask || prevTask.state !== 'BLOCKED') {
                    const blockerResId = currTask.blockedOn;
                    const ceilingBlockerId = currTask.ceilingBlocker ? currTask.ceilingBlocker.id : null;

                    let msg = "";

                    if (ceilingBlockerId) {
                        // PCP Specific Blocking
                        msg = `<strong>${currTask.id} blocked</strong> by System Ceiling (Ceiling held by ${ceilingBlockerId}).`;
                    } else if (blockerResId) {
                        // Standard Mutex Blocking
                        // Find who owns it RIGHT NOW in this snapshot
                        const resOwner = getResourceOwnerAtTime(currentSnapshot, blockerResId);
                        msg = `<strong>${currTask.id} blocked</strong> waiting for resource [${blockerResId}] (held by ${resOwner}).`;
                    } else {
                        msg = `${currTask.id} blocked (Reason unknown).`;
                    }

                    printLogLine(logContainer, time, msg, "orange");
                }
            }

            // C. Deadlock Detection
            if (currTask.state === 'DEADLOCKED' || currTask.state === 'DEADLOCK') {
                if (!prevTask || (prevTask.state !== 'DEADLOCKED' && prevTask.state !== 'DEADLOCK')) {
                    printLogLine(logContainer, time, `<strong>DEADLOCK:</strong> ${currTask.id} is stuck in a cycle!`, "red");
                }
            }
        });

        // --- 2. HANDLE IDLE COMPRESSION ---
        if (runId === null) {
            consecutiveIdle++;
            previousRunId = null;
            previousSnapshot = currentSnapshot;
            return;
        } else {
            if (consecutiveIdle > 0) {
                printLogLine(logContainer, `${time - consecutiveIdle} - ${time - 1}`, "System Idle", "gray");
                consecutiveIdle = 0;
            }
        }

        // --- 3. DETECT GLOBAL EVENTS ---

        // A. DETECT PREEMPTION
        // If the task that was running LAST tick is now READY, it was preempted.
        if (previousRunId && previousRunId !== runId) {
            // Find the task that WAS running
            const prevTaskNow = currentSnapshot.find(t => t.id === previousRunId);

            // If it still exists and is READY, it didn't finish or block—it was forced out.
            if (prevTaskNow && prevTaskNow.state === 'READY') {
                printLogLine(logContainer, time,
                    `<strong>Preemption:</strong> ${previousRunId} preempted by higher priority task (${runId}).`,
                    "purple");
            }
        }

        // B. STANDARD CONTEXT SWITCH (New task started)
        if (runId !== previousRunId && runningTaskSnap) {
            if (runningTaskSnap.state === 'RUNNING' || runningTaskSnap.state === 'COMPLETED') {
                printLogLine(logContainer, time, `Context Switch: ${runId} started executing.`, "green");
            }
        }

        // E. DEADLINE MISSES
        if (tickData.events && tickData.events.length > 0) {
            tickData.events.forEach(evt => {
                if (evt.type === 'DEADLINE_MISS') {
                    printLogLine(logContainer, time, `<strong>DEADLINE MISSED:</strong> ${evt.taskId} did not finish in time!`, "red");
                }
            });
        }

        previousRunId = runId;
        previousSnapshot = currentSnapshot;
    });

    // Flush trailing idle
    if (consecutiveIdle > 0) {
        printLogLine(logContainer, `${history.length - consecutiveIdle} - ${history.length}`, "System Idle", "gray");
    }
}

// Helper to look up resource ownership in a specific snapshot
function getResourceOwnerAtTime(snapshotTasks, resourceId) {
    for (let t of snapshotTasks) {
        if (t.heldResources && t.heldResources.includes(resourceId)) {
            return t.id;
        }
    }
    return "Unknown";
}

// Helper for consistent styling
function printLogLine(container, time, message, colorClass) {
    const div = document.createElement('div');
    div.style.borderBottom = "1px solid #eee";
    div.style.padding = "4px 0";
    div.style.fontFamily = "monospace";
    div.style.fontSize = "13px";

    let color = "#333";
    if (colorClass === 'red') color = "#d9534f"; // Bootstrap Danger
    if (colorClass === 'orange') color = "#f0ad4e"; // Bootstrap Warning
    if (colorClass === 'green') color = "#5cb85c"; // Bootstrap Success
    if (colorClass === 'gold') color = "#d4af37"; // Gold for Priority
    if (colorClass === 'purple') color = "#6f42c1"; // Purple for Preemption
    if (colorClass === 'gray') color = "#999";

    // Format: T=X  Message
    div.innerHTML = `<span style="color:#888; width:60px; display:inline-block;">T=${time}</span> <span style="color:${color}">${message}</span>`;
    container.appendChild(div);
}

// Initial UI
updateUI();
