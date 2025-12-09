/**
 * RTOS Schedule Visualization
 * Implements RMS, Priority Inversion, and PIP.
 */

// --- Constants & Enums ---
const CONSTANTS = {
    SIMULATION_TIME: 50,
    TICK_WIDTH_PX: 20,
    ROW_HEIGHT_PX: 40,
    HEADER_HEIGHT: 30
};

const STATE = {
    READY: 'READY',
    RUNNING: 'RUNNING',
    BLOCKED: 'BLOCKED',
    COMPLETED: 'COMPLETED' // For a specific period
};

// --- Models ---

class Resource {
    constructor(id) {
        this.id = id;
        this.owner = null; // Task ID or null
        this.queue = []; // Array of {taskId, originalPriority}
    }
}

class Task {
    constructor(id, period, cost, priority, color) {
        this.id = id;
        this.period = parseInt(period);
        this.cost = parseInt(cost);
        this.basePriority = parseInt(priority);
        this.currentPriority = parseInt(priority); // For PIP
        this.color = color;
        
        // Dynamic State
        this.remainingCost = 0;
        this.nextRelease = 0;
        this.state = STATE.COMPLETED; // Initially completed so it releases at 0
        this.deadline = 0;
        this.resourceRequests = []; // Array of {resId, startAt, duration}
        
        // Runtime tracking
        this.executedInPeriod = 0;
        this.blockedOn = null; // Resource ID
    }

    reset() {
        this.currentPriority = this.basePriority;
        this.remainingCost = 0;
        this.nextRelease = 0;
        this.state = STATE.COMPLETED;
        this.executedInPeriod = 0;
        this.blockedOn = null;
    }
}

class Scheduler {
    constructor() {
        this.tasks = [];
        this.resources = {};
        this.history = []; // Snapshot of each tick
        this.enablePIP = false;
        this.currentTime = 0;
    }

    addTask(task) {
        this.tasks.push(task);
    }

    addResource(id) {
        if (!this.resources[id]) {
            this.resources[id] = new Resource(id);
        }
    }

    reset() {
        this.currentTime = 0;
        this.history = [];
        this.tasks.forEach(t => t.reset());
        Object.values(this.resources).forEach(r => {
            r.owner = null;
            r.queue = [];
        });
    }

    // Rate Monotonic Scheduling Check: Lower period = Higher priority
    // But user assigns manual priority, so we stick to manual priority as 'RMS' equivalent for this sim.
    // Lower value = Higher Priority.

    runSimulation() {
        this.reset();
        
        for (let t = 0; t < CONSTANTS.SIMULATION_TIME; t++) {
            this.tick(t);
        }
        
        drawVisualization(this.tasks, this.history);
        logSimulation(this.history);
    }

    tick(time) {
        // 1. Release Tasks
        this.tasks.forEach(task => {
            if (time >= task.nextRelease) {
                // New Period
                task.state = STATE.READY;
                task.remainingCost = task.cost;
                task.executedInPeriod = 0;
                task.deadline = task.nextRelease + task.period;
                task.nextRelease += task.period;
                task.currentPriority = task.basePriority; // Reset priority
            }
        });

        // 2. Determine Highest Priority Ready Task
        // Filter tasks that are READY or RUNNING or BLOCKED (Blocked tasks are technically candidates but can't run)
        let readyTasks = this.tasks.filter(t => t.state === STATE.READY || t.state === STATE.RUNNING || t.state === STATE.BLOCKED);
        
        // Sort by Priority (Ascending value)
        readyTasks.sort((a, b) => a.currentPriority - b.currentPriority);

        let runningTask = null;
        let blockedEvent = null;

        // Try to find a task to run
        for (let task of readyTasks) {
            if (task.state === STATE.BLOCKED) {
                // Task is blocked, can't run
                continue;
            }

            // Check if task needs a resource AT THIS EXACT MOMENT of its execution
            // We look at task.executedInPeriod to see if a resource request starts here
            let neededRes = task.resourceRequests.find(r => r.startAt === task.executedInPeriod);
            
            if (neededRes) {
                let res = this.resources[neededRes.resId];
                if (res.owner && res.owner !== task.id) {
                    // Resource Blocked!
                    task.state = STATE.BLOCKED;
                    task.blockedOn = res.id;
                    
                    // Priority Inheritance
                    if (this.enablePIP) {
                        let ownerTask = this.tasks.find(t => t.id === res.owner);
                        if (ownerTask && ownerTask.currentPriority > task.currentPriority) {
                            // Inherit: Owner gets the higher priority (lower value) of the blocked task
                            ownerTask.currentPriority = task.currentPriority; 
                            logEntry(time, `PIP: ${ownerTask.id} inherits priority ${task.currentPriority} from ${task.id}`);
                        }
                    }
                    continue; // Check next priority task
                } else {
                    // Acquire resource
                    if (!res.owner) {
                        res.owner = task.id;
                    }
                }
            }
            
            // If we get here, task is runnable
            runningTask = task;
            break;
        }

        // 3. Update Run State
        if (runningTask) {
            runningTask.state = STATE.RUNNING;
            runningTask.remainingCost--;
            runningTask.executedInPeriod++;
            
            // Check if resource usage ended
            // We need to check all resources owned by this task
            // and see if the duration has passed
             runningTask.resourceRequests.forEach(req => {
                 // If we have executed enough to finish this request
                 // executedInPeriod is now 1 greater than when we started this tick.
                 // startAt 1, duration 2. runs at 1, 2. at end of 2 (executedInPeriod=3?), release.
                 // Let's say startAt=0, duration=1.
                 // Tick 0: executed=0 -> 1. 1 = 0+1. Release?
                 if (runningTask.executedInPeriod === req.startAt + req.duration) {
                     let res = this.resources[req.resId];
                     if (res && res.owner === runningTask.id) {
                         res.owner = null;
                         // Restore Priority if PIP
                         if (this.enablePIP) {
                             // Naive PIP restoration: reset to base. 
                             // Real implementations might lower to the highest of remaining blocked tasks, 
                             // but simple reset is often sufficient for basic demos.
                             runningTask.currentPriority = runningTask.basePriority; 
                         }
                     }
                 }
            });

            if (runningTask.remainingCost <= 0) {
                runningTask.state = STATE.COMPLETED;
                // Ensure all resources are released (failsafe)
                 Object.values(this.resources).forEach(r => {
                    if (r.owner === runningTask.id) { 
                        r.owner = null; 
                        runningTask.currentPriority = runningTask.basePriority;
                    }
                });
            }
        }

        // 4. Record History
        let snapshot = this.tasks.map(t => ({
            id: t.id,
            state: t.state,
            remaining: t.remainingCost,
            blockedOn: t.blockedOn,
            prio: t.currentPriority,
            wasPreempted: (t.state === STATE.READY && runningTask && runningTask !== t)
        }));
        
        this.history.push({
            time: time,
            runningTaskId: runningTask ? runningTask.id : null,
            tasks: snapshot
        });
    }
}

// --- Integration ---

const scheduler = new Scheduler();

// DOM Elements
const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');
const logDiv = document.getElementById('logContent');

// Setup UI
document.getElementById('taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('taskId').value;
    const p = document.getElementById('taskPeriod').value;
    const c = document.getElementById('taskCost').value;
    const prio = document.getElementById('taskPrio').value;
    const col = document.getElementById('taskColor').value;
    
    // Check dupe
    if(scheduler.tasks.find(t => t.id === id)) {
        alert('Task ID exists');
        return;
    }

    const task = new Task(id, p, c, prio, col);
    scheduler.addTask(task);
    updateTaskList();
    updateResourceSelect();
});

document.getElementById('resourceForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const tId = document.getElementById('resTaskSelect').value;
    const rId = document.getElementById('resId').value;
    const start = parseInt(document.getElementById('resStart').value);
    const dur = parseInt(document.getElementById('resDuration').value);

    if(!tId || !rId) return;

    scheduler.addResource(rId);
    
    const task = scheduler.tasks.find(t => t.id === tId);
    if(task) {
        task.resourceRequests.push({ resId: rId, startAt: start, duration: dur });
         alert(`Added Resource ${rId} to ${tId} at exec time ${start} for ${dur}`);
    }
});

document.getElementById('runBtn').addEventListener('click', () => {
    scheduler.enablePIP = document.getElementById('pipToggle').checked;
    logDiv.innerHTML = '';
    scheduler.runSimulation();
});

document.getElementById('resetBtn').addEventListener('click', () => {
    // Reload page or soft reset
    scheduler.tasks = [];
    scheduler.resources = {};
    updateTaskList();
    updateResourceSelect();
    ctx.clearRect(0,0,canvas.width, canvas.height);
    logDiv.innerHTML = '';
});

function updateTaskList() {
    const list = document.getElementById('taskList');
    list.innerHTML = scheduler.tasks.map(t => 
        `<div class="task-item" style="border-left-color: ${t.color}">
            <strong>${t.id}</strong> (P:${t.period}, C:${t.cost}, Pri:${t.basePriority})
        </div>`
    ).join('');
}

function updateResourceSelect() {
    const sel = document.getElementById('resTaskSelect');
    sel.innerHTML = scheduler.tasks.map(t => `<option value="${t.id}">${t.id}</option>`).join('');
}

function logEntry(time, msg) {
    // Optional console log or rigorous logging
    // console.log(`[T=${time}] ${msg}`);
}

function logSimulation(history) {
    // Generate text log summary if needed
}

// --- Visualization ---
function drawVisualization(tasks, history) {
    // Setup Canvas
    const width = CONSTANTS.TICK_WIDTH_PX * CONSTANTS.SIMULATION_TIME + 100;
    const height = CONSTANTS.HEADER_HEIGHT + (tasks.length * CONSTANTS.ROW_HEIGHT_PX) + 50;
    
    canvas.width = width;
    canvas.height = height;
    
    // Clear
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    
    // Draw Axis
    ctx.fillStyle = "#000";
    ctx.font = "12px Arial";
    for(let t = 0; t <= CONSTANTS.SIMULATION_TIME; t++) {
        let x = 100 + (t * CONSTANTS.TICK_WIDTH_PX);
        ctx.fillText(t, x - 5, 20);
        
        // Grid line
        ctx.strokeStyle = "#eee";
        ctx.beginPath();
        ctx.moveTo(x, 30);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    // Draw Tasks
    tasks.forEach((task, index) => {
        let y = 40 + (index * CONSTANTS.ROW_HEIGHT_PX);
        
        // Label
        ctx.fillStyle = "#000";
        ctx.fillText(`${task.id} (P${task.currentPriority})`, 10, y + 20);
        
        // Draw execution history
        history.forEach(tick => {
            let taskState = tick.tasks.find(t => t.id === task.id);
            if(!taskState) return;

            let x = 100 + (tick.time * CONSTANTS.TICK_WIDTH_PX);
            let w = CONSTANTS.TICK_WIDTH_PX - 2;
            let h = 30;

            if (taskState.state === STATE.RUNNING) {
                ctx.fillStyle = task.color;
                ctx.fillRect(x, y, w, h);
            } else if (taskState.state === STATE.BLOCKED) {
                ctx.fillStyle = "#e74c3c"; // Red for blocked
                ctx.fillRect(x, y, w, h/2); // Half height
                ctx.fillStyle = "#000";
                ctx.font = "10px Arial";
                ctx.fillText(`Blk:${taskState.blockedOn}`, x, y + 10);
            } else if (taskState.wasPreempted) {
                // Was ready but not running -> Preempted
                ctx.strokeStyle = "#bdc3c7";
                ctx.strokeRect(x, y, w, h);
            }
            // If completed or future, nothing
        });
    });
}

// Initialize with a demo scenario?
// Optional: Pre-populate for user convenience
function demoSetup() {
    // Task 1: High Priority (Low P), Short
    // Task 2: Low Priority (High P), Long, Uses Resource
    // Task 3: Medium Priority
    
    // A: P=20, C=4, Prio=1 (High)
    // B: P=40, C=10, Prio=3 (Low)
    // M: P=30, C=5, Prio=2 (Med)
    
    /* 
       Scenario for Inversion:
       1. Low runs, grabs Resource.
       2. High runs, needs Resource -> Blocks.
       3. Med runs, Preempts Low.
       High is blocked by Low, Low is preempted by Med. 
       High is waiting on Med (Inversion).
    */

    const tL = new Task('Low', 50, 10, 3, '#2ecc71'); // Green
    const tM = new Task('Med', 50, 5, 2, '#f1c40f'); // Yellow
    const tH = new Task('High', 20, 4, 1, '#e74c3c'); // Red

    scheduler.addTask(tH);
    scheduler.addTask(tM);
    scheduler.addTask(tL);
    
    scheduler.addResource('R1');
    
    // Low uses R1 from t=1 for 5 units
    tL.resourceRequests.push({ resId: 'R1', startAt: 0, duration: 6 });
    // High uses R1 from t=0 for 2 units
    tH.resourceRequests.push({ resId: 'R1', startAt: 0, duration: 2 });
    
    // M just runs.
    
    // Note: To force inversion, we need Low to start BEFORE High.
    // RMS: High starts at 0. So High runs immediately.
    // If High needs R1 immediately, it takes it.
    // We need Low to have the resource already.
    // To Simulate this effectively in RMS starting at 0 is hard unless we offset release times.
    // Adding release offset is a feature we might need or we just arrange Cost/Period such that:
    // T=0: All release. High runs. Finishes.
    // T=4: High done. Med runs.
    
    // Let's rely on user manual input for now.
    updateTaskList();
    updateResourceSelect();
}

// demoSetup();
