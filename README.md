# RTOS Schedule Visualization
![Node.js CI](https://github.com/Dood345/SchedulerVisualization/actions/workflows/ci.yml/badge.svg)

A web-based simulator for visualizing Real-Time System scheduling algorithms. This tool allows users to model periodic tasks with complex instruction sequences (Compute, Lock, Unlock) and visualize the resulting schedule using Rate Monotonic Scheduling (RMS). It supports deadlock detection and resource access protocols like Priority Inheritance (PIP) and Priority Ceiling (PCP).

## Features

- **Rate Monotonic Scheduling (RMS):** Automatically assigns priorities based on task periods (shorter period = higher priority).
- **Task Builder:** Create tasks with flexible instruction sequences:
  - `COMPUTE(duration)`: CPU execution time.
  - `LOCK(resource)`: Acquire a shared resource.
  - `UNLOCK(resource)`: Release a share resource.
  - **Visualization:** See the pipeline of your task instructions in the "Task Definitions" tab.
- **Resource Management:**
  - Define shared resources with explicit Priority Ceilings (for PCP).
  - "Resource Status" tab monitors current owners, blocked queues, and dynamic priority ceilings.
- **Concurrency Protocols:** Toggle between:
  - **None (Inversion):** Visualize unbounded Priority Inversion scenarios.
  - **PIP (Inheritance):** Visualize Priority Inheritance Protocol preventing inversion.
  - **PCP (Ceiling):** Visualize Priority Ceiling Protocol preventing deadlocks and daisy-chain blocking.
- **Deadline Miss Detection:** 
  - Automatically checks if a task completes within its period.
  - **Visual:** Marks the exact miss time with a distinct **Red X**.
  - **Logs:** Alerts the user in the simulation log.
- **Enhanced Visualization:** 
  - **Lifelines:** Differentiates between "Preempted" tasks (thin connecting lines) vs. "Blocked" tasks (translucent bars).
  - **Detailed Tooltips:** Hover over any segment to see exact state (Resources held, blocked reason, priority boost status).
- **Deadlock Detection:** The simulator halts and visually indicates if a deadlock occurs (circular wait).

## Getting Started

### Prerequisites

This is a client-side web application. You do not need NodeJS, Python, or any backend server to run it.

### How to Run

### How to Run
> **Note:** Because this project uses modern JavaScript Modules (`import`/`export`), it **cannot** be run by simply double-clicking `index.html`. You must serve it over a local web server to avoid CORS errors.

#### Option 1: VS Code (Recommended)
1.  Open the project folder in **Visual Studio Code**.
2.  Install the **Live Server** extension (by Ritwick Dey).
3.  Right-click `index.html` and select **"Open with Live Server"**.

#### Option 2: Python (No installation required)
If you have Python installed:
1.  Open a terminal/command prompt in the project folder.
2.  Run: `python -m http.server 8000`
3.  Open your browser to `http://localhost:8000`

### Usage Guide

1.  **Define Resources (Optional):**
    - Go to the "Define Resources" panel in the sidebar.
    - Enter a Resource ID (e.g., `R1`) and its Priority Ceiling (highest priority of any task that *might* access it).
    - Click **Register Resource**.

2.  **Add Tasks:**
    - Enter a Task ID (e.g., `T1`), Period, Offset, and Priority.
    - Use the **Segment Builder** to define the task's execution timeline:
        - **Duration:** Enter how long this segment runs (in ms).
        - **Resources:** Click the "Resources" button to select any materials (Mutexes) held *during* this segment.
        - Click the **+** button to add this segment to the task chain.
    - Repeat for as many segments as needed (e.g., Compute -> Hold R1 -> Compute).
    - Pick a color and click **Add Task** to save it.

3.  **Select Protocol:**
    - Use the toggle buttons at the top to switch between `None`, `PIP`, or `PCP`.

4.  **Run Simulation:**
    - Click **Run Simulation** to see the Gantt chart.
    - Hover over blocks to see detailed state (Blocked on X, Holding Y, Priority Boosted, etc.).
    - Check the **Simulation Log** or **Resource Status** tabs at the bottom for more details.

5.  **Load Demos:**
    - Click the orange **Load Demo** button to try pre-configured scenarios like "Priority Inversion", "Deadlock", or "Instant Deadlock (Overload)".

## Author

Daniel Ripley-Betts
Developed for Real-Time Systems Term Project, Fall 2025.
