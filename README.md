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
- **Deadlock Detection:** The simulator halts and visually indicates if a deadlock occurs (circular wait).

## Getting Started

### Prerequisites

This is a client-side web application. You do not need NodeJS, Python, or any backend server to run it.

### How to Run

1.  **Clone or Download** this repository.
2.  Navigate to the project folder.
3.  **Double-click `index.html`** to open it in your default web browser.

### Usage Guide

1.  **Define Resources (Optional):**
    - Go to the "Define Resources" panel in the sidebar.
    - Enter a Resource ID (e.g., `R1`) and its Priority Ceiling (highest priority of any task that *might* access it).
    - Click **Register Resource**.

2.  **Add Tasks:**
    - Enter a Task ID (e.g., `T1`), Period, and Offset.
    - Use the **Instruction Builder** to define what the task does:
        - Select `COMPUTE` and enter a duration.
        - Select `LOCK` or `UNLOCK` and choose a defined resource from the dropdown.
    - Click **+ Add Step** for each operation.
    - Finally, click **Add Task** to save it.

3.  **Select Protocol:**
    - Use the toggle buttons at the top to switch between `None`, `PIP`, or `PCP`.

4.  **Run Simulation:**
    - Click **Run Simulation** to see the Gantt chart.
    - Hover over blocks to see detailed state (Blocked on X, Holding Y, Priority Boosted, etc.).
    - Check the **Simulation Log** or **Resource Status** tabs at the bottom for more details.

5.  **Load Demos:**
    - Click the orange **Load Demo** button to try pre-configured scenarios like "Priority Inversion" or "Deadlock".

## Author

Daniel Ripley-Betts
Developed for Real-Time Systems Term Project, Fall 2025.
