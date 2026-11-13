# Offline Field Issue Tracker — Complete Technical Blueprint & Architecture Specification

> **Graduation Project Specification & Architectural Plan**  
> **System:** Offline-First Infrastructure Problem Reporting & Coordination Platform  
> **Version:** 1.0.0 — Comprehensive Engineering Blueprint

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural parameters have been aligned with your preferences and will govern the implementation:

- **Confirmed Aesthetic & Contrast**: **High-contrast outdoor utility theme** supporting both high-legibility Light mode (optimized for direct sunlight readability) and Dark mode (battery conservation and low-light inspection). Built with Tailwind CSS v4 `@custom-variant dark (&:where(.dark, .dark *));`.
- **Confirmed Sensor & Media Pipeline**: **GPS Geolocation auto-detection** (`navigator.geolocation` with fallback to manual coordinates/address) + **Offline photo capture** stored locally in IndexedDB as binary Blobs with instant client preview and multipart/base64 sync.
- **Confirmed Sync Automation**: **Automatic background synchronization** on active health verification (`GET /api/v1/health`), paired with real-time toast notifications, accompanied by a **Manual "Sync Now" trigger** and interactive queue inspector for field workers.

---

## 1. Overview & Core Concept

### 1.1 The Problem
Field technicians and community workers inspecting infrastructure (water distribution networks, electrical grids, transport corridors, public facilities) routinely operate in remote, rural, or disaster-affected zones where cellular signals are intermittent or nonexistent. Standard cloud-dependent applications fail, drop unsaved forms, or block submissions when disconnected.

### 1.2 The Solution
The **Offline Field Issue Tracker** is an offline-first, distributed issue management system built on three pillars:
1. **Zero-Data-Loss Local Persistence**: Every draft, report submission, and media attachment is immediately committed to client-side IndexedDB (Dexie.js) before any network attempt.
2. **Deterministic Idempotency**: Reports receive client-generated UUID v4 keys (`client_id`) that are uniquely indexed on the PostgreSQL backend, preventing duplicates across network retries, connection drops, or dual submissions.
3. **Active Health-Gated Auto-Sync Engine**: An intelligent sync worker verifies true end-to-end API reachability (bypassing dead Wi-Fi and captive portals) and drains queues with exponential backoff and randomized jitter.
4. **Coordinator Operations Center**: A responsive triage dashboard with an enforced finite state machine, preventing illegal status transitions and maintaining an append-only audit trail (`activity_logs`).

---

## 2. User Experience & Visual Design

### 2.1 Personas & Core Journeys

| Persona | Environment & Device | Core Needs |
| :--- | :--- | :--- |
| **Field Worker** (e.g. Samuel K.) | Outdoor, handheld smartphone / rugged tablet, dusty/glare conditions | Fast 1-handed issue reporting, instant offline save, clear sync badge, GPS capture, photo attachment, draft continuation. |
| **Coordinator** (e.g. Elena M.) | Operations room / laptop, multi-monitor or standard desktop | High-density triage table, status workflow controls, technician assignment, category/priority filtering, SLA monitoring, audit history. |

### 2.2 Visual Identity & Palette
- **Dominant Neutral Canvas (60%)**: 
  - Light mode: Pure crisp white (`#FFFFFF`) and slate canvas (`#F8FAFC`).
  - Dark mode: Deep basalt slate (`#0B0F17`) with card structural surface (`#111827`).
- **Structural Surfaces & Hairline Dividers (30%)**: Single-elevation borders (`border-slate-200 dark:border-slate-800`), 0 decorative drop shadows, no nested cards-within-cards.
- **Accent & Intent Budget (10%)**: 
  - Brand Primary: Electric Amber/Safety Gold (`#D97706` / `text-amber-500` / `bg-amber-600`) evocative of civil engineering and field safety.
  - Success/Synched: Emerald (`#059669` / `#10B981`).
  - Critical Priority / Alert: Crimson (`#DC2626`).
  - Offline / In Queue: Blue-Indigo (`#4F46E5`).
- **Zero-Pill Discipline**: All status indicators, timestamps, and priority tags render as clean unboxed text separated by subtle bullets (`·`) or functional segmented control tabs. No rounded candy capsules or pill badges.
- **Typography**: Display headlines in `Plus Jakarta Sans`, data metrics and timestamps in tabular monospace (`font-mono tabular-nums`), body text in clean `Plus Jakarta Sans`.

---

## 3. System Architecture & Topology

```
+-----------------------------------------------------------------------------------------+
|                                    CLIENT APPLICATION                                   |
|                                                                                         |
|  +------------------------------------+       +--------------------------------------+  |
|  |       FIELD WORKER INTERFACE       |       |        COORDINATOR DASHBOARD         |  |
|  | - Quick Report Form (Photo + GPS)  |       | - Triage Data Grid (Filter/Search)   |  |
|  | - Offline Drafts & Local Queue     |       | - Status State Machine Controls      |  |
|  | - Sync Status & Manual Retry Bar   |       | - Technician Assignment Modal        |  |
|  +-----------------+------------------+       +-------------------+------------------+  |
|                    |                                              |                     |
|                    v                                              v                     |
|  +-----------------------------------------------------------------------------------+  |
|  |                                CLIENT APPLICATION STATE                           |  |
|  | - Auth Context (JWT Session, User Role, Profile)                                  |  |
|  | - Connectivity Store (Active Probe State, Navigator Events, Latency)             |  |
|  | - IndexedDB Layer (Dexie.js: 'drafts', 'pendingReports', 'syncedCache', 'blobs')  |  |
|  +-----------------+----------------------------------------------+------------------+  |
|                    |                                              |                     |
|                    v                                              |                     |
|  +------------------------------------+                           |                     |
|  |   OFFLINE SYNC WORKER & QUEUE      |                           |                     |
|  | - Active Health Probe (/health)    |                           |                     |
|  | - Exponential Backoff + Jitter     |                           |                     |
|  | - Blob-to-Payload Transformer      |                           |                     |
|  +-----------------+------------------+                           |                     |
+--------------------|----------------------------------------------|---------------------+
                     | HTTPS (Bearer JWT + client_id)               |
                     v                                              v
+-----------------------------------------------------------------------------------------+
|                                  EXPRESS.JS BACKEND API                                 |
|                                                                                         |
|  +-----------------------------------------------------------------------------------+  |
|  | Middleware Pipeline: Helmet -> Strict CORS -> Body Parser -> Request Logger       |  |
|  +-----------------------------------------+-----------------------------------------+  |
|                                            |                                            |
|                                            v                                            |
|  +--------------------+  +--------------------+  +------------------+  +-------------+  |
|  |  Auth Middleware   |  |  Role Gatekeeper   |  |   Zod Schema     |  | Idempotency |  |
|  | (Supabase JWT/UID) |  | (Worker vs Coord)  |  |   Validators     |  | Dedup Guard |  |
|  +---------+----------+  +---------+----------+  +--------+---------+  +------+------+  |
|            +-----------------------+----------------------+-------------------+         |
|                                            v                                            |
|  +-----------------------------------------------------------------------------------+  |
|  | REST Controllers:                                                                 |  |
|  | - /api/v1/health           -> Lightweight connection reachability probe           |  |
|  | - /api/v1/auth/me          -> User profile, role, session verification            |  |
|  | - /api/v1/reports          -> List & create reports with client_id idempotency     |  |
|  | - /api/v1/reports/:id      -> Detailed report view, photo url, & audit history    |  |
|  | - /api/v1/reports/:id/stat -> State machine validator (version lock)             |  |
|  | - /api/v1/sync/batch       -> Atomic multi-report drain endpoint                  |  |
|  | - /api/v1/dashboard/stats  -> Aggregated KPIs, SLAs, category & priority metrics  |  |
|  +-----------------------------------------+-----------------------------------------+  |
+--------------------------------------------|--------------------------------------------+
                                             v
+-----------------------------------------------------------------------------------------+
|                               SUPABASE POSTGRESQL DATABASE                              |
|                                                                                         |
|  +-----------------+  +-----------------+  +--------------------+  +-----------------+  |
|  |    profiles     |  |     reports     |  |   activity_logs    |  |    sync_logs    |  |
|  | - id (UUID PK)  |  | - id (UUID PK)  |  | - id (UUID PK)     |  | - id (UUID PK)  |  |
|  | - role (ENUM)   |  | - client_id(UQ) |  | - report_id (FK)   |  | - client_id     |  |
|  | - full_name     |  | - status (ENUM) |  | - actor_id (FK)    |  | - attempt_count |  |
|  | - organization  |  | - version (INT) |  | - event_type (ENUM)|  | - response_code |  |
|  +-----------------+  +-----------------+  +--------------------+  +-----------------+  |
|  | PostgreSQL Row Level Security (RLS) Enforced Database Policies                       |  |
|  +-----------------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------------+
```

---

## 4. User Roles and Authorization Matrix (RBAC)

The system enforces strict multi-role separation on both client routes and backend API endpoints:

| Feature / Operation | Field Worker | Coordinator | Public / Unauth |
| :--- | :---: | :---: | :---: |
| Self-Register & Log In | **Yes** (role locked to `field_worker`) | Login only (pre-provisioned) | Yes (signup/login) |
| Create Local Drafts (Offline) | **Yes** | No | No |
| Submit Reports (Online/Offline) | **Yes** | **Yes** | No |
| View Own Reports | **Yes** | **Yes** | No |
| View All Field Reports | No (own only) | **Yes** (all reports) | No |
| Re-edit Draft Reports | **Yes** (if `Draft`) | No | No |
| Assign Technician | No | **Yes** | No |
| Transition to `In Progress` / `Resolved` | No | **Yes** | No |
| Reject Report with Reason | No | **Yes** ($\ge 10$ char reason) | No |
| Trigger Manual / Auto Sync | **Yes** | **Yes** | No |
| View Full Audit Log | Own reports | All reports | No |
| View Dashboard Analytics / KPIs | Own metrics | Global operations KPIs | No |

*Administrative Rule:* The registration endpoint strictly sets `role = 'field_worker'`. Coordinator accounts cannot be self-assigned; they must be provisioned via admin database seeding or Supabase dashboard configuration.

---

## 5. Database Architecture & Schema Specification

### 5.1 Tables & Schema (PostgreSQL)

```sql
-- 1. Custom Types
CREATE TYPE user_role AS ENUM ('field_worker', 'coordinator', 'admin');
CREATE TYPE report_status AS ENUM ('draft', 'submitted', 'assigned', 'in_progress', 'resolved', 'rejected');
CREATE TYPE report_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE report_category AS ENUM (
  'water_infrastructure',
  'equipment_damage',
  'service_interruption',
  'safety_concern',
  'maintenance',
  'other'
);
CREATE TYPE audit_event AS ENUM (
  'report_created',
  'report_saved_offline',
  'report_submitted',
  'sync_started',
  'sync_completed',
  'sync_failed',
  'report_assigned',
  'status_changed',
  'report_rejected',
  'comment_added'
);

-- 2. Profiles Table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone_number TEXT,
  role user_role NOT NULL DEFAULT 'field_worker',
  organization TEXT DEFAULT 'Public Infrastructure Works',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Reports Table (with client_id unique idempotency constraint)
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE, -- Client-generated UUID v4
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category report_category NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location_name TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_meters DOUBLE PRECISION,
  priority report_priority NOT NULL DEFAULT 'medium',
  status report_status NOT NULL DEFAULT 'submitted',
  rejection_reason TEXT,
  photo_url TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1 -- Optimistic locking
);

-- 4. Immutable Activity Logs Table (Append-Only)
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_type audit_event NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Synchronization Logs Table
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  result TEXT NOT NULL, -- 'success', 'conflict', 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for high-frequency queries
CREATE INDEX idx_reports_created_by ON reports(created_by);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_priority ON reports(priority);
CREATE INDEX idx_reports_category ON reports(category);
CREATE INDEX idx_reports_client_id ON reports(client_id);
CREATE INDEX idx_activity_logs_report_id ON activity_logs(report_id);
CREATE INDEX idx_sync_logs_client_id ON sync_logs(client_id);
```

### 5.2 Row Level Security (RLS) Policies

```sql
-- Enable RLS on all operational tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: Users view themselves; coordinators view all
CREATE POLICY "Profiles self view" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Coordinators view all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coordinator', 'admin'))
);

-- Reports: Field workers see own reports; Coordinators see all
CREATE POLICY "Field workers view own reports" ON reports FOR SELECT USING (
  created_by = auth.uid() OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coordinator', 'admin'))
);

CREATE POLICY "Field workers create reports" ON reports FOR INSERT WITH CHECK (
  created_by = auth.uid()
);

CREATE POLICY "Coordinators update reports" ON reports FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coordinator', 'admin'))
);

-- Activity Logs: Append-only rule (No UPDATE, No DELETE)
CREATE POLICY "Read activity logs" ON activity_logs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM reports 
    WHERE reports.id = activity_logs.report_id AND (
      reports.created_by = auth.uid() OR
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coordinator', 'admin'))
    )
  )
);
CREATE POLICY "Insert activity logs" ON activity_logs FOR INSERT WITH CHECK (true);
```

---

## 6. Offline-First Synchronization & IndexedDB Engine

### 6.1 Local IndexedDB Schema (Dexie.js)
```typescript
interface LocalReport {
  local_id?: number;          // Auto-increment primary key
  client_id: string;          // UUID v4 - Persistent idempotency key
  title: string;
  category: string;
  description: string;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'draft' | 'submitted';
  sync_status: 'draft' | 'pending' | 'synchronizing' | 'synchronized' | 'failed';
  photo_blob?: Blob | null;   // Stored offline locally in IndexedDB
  photo_preview?: string;     // Base64 or object URL for immediate display
  reported_at: string;
  created_at: string;
  updated_at: string;
  sync_attempts: number;
  last_sync_error?: string | null;
  server_id?: string | null;  // Filled once server returns HTTP 200/201
}
```

### 6.2 Active Health Probe Strategy
Standard browsers fire `window.addEventListener('online')` when an interface attaches to a Wi-Fi router, even if the uplink is completely severed or behind an authentication captive portal. 

Our active prober executes:
1. `HEAD /api/v1/health` with a strict **3-second timeout** via `AbortController`.
2. Probe runs on:
   - Initial page mount
   - Browser `'online'` window event
   - Every 30 seconds when pending reports exist in IndexedDB
   - Immediately when the user clicks **"Sync Now"**
3. If probe succeeds (HTTP 200 `{"status": "healthy"}`), connectivity state transitions to `ONLINE_VERIFIED` and the queue drain triggers.
4. If probe times out or fails with network errors, state transitions to `OFFLINE` and the queue remains safely paused.

### 6.3 Exponential Backoff with Jitter
Failed sync attempts back off gracefully to protect the server from a thundering herd when cellular coverage is restored:
$$T_{\text{delay}} = \min\left(60\text{s},\ 2\text{s} \times 2^{\text{attempt}}\right) \times (1 \pm \text{jitter}_{0.2})$$

### 6.4 Zero-Data-Loss Invariant
1. Report written to IndexedDB with `sync_status = 'pending'`.
2. Sync Worker sends `POST /api/v1/sync/batch` containing report data and base64 photo payload.
3. Server commits transaction, writes `reports`, `activity_logs`, and `sync_logs`, and responds with `HTTP 201 Created` or `HTTP 200 OK` (if idempotency detected).
4. Only upon receiving the confirmed response does the client update `sync_status = 'synchronized'` and set `server_id`. **No record is ever deleted locally.**

---

## 7. Report Status Lifecycle & Finite State Machine

```
              +-------------+
              |    Draft    | (Field Worker can edit)
              +------+------+
                     |
                     | Worker submits (online or offline)
                     v
              +-------------+
              |  Submitted  +-------------------------+
              +------+------+                         |
                     |                                |
                     | Coordinator assigns            |
                     v                                |
              +-------------+                         | Coordinator rejects
              |  Assigned   +------------------------>| (Mandatory >=10 char
              +------+------+                         |  reason recorded in
                     |                                |  audit history)
                     | Work starts                    |
                     v                                |
              +-------------+                         |
              | In Progress +-------------------------+
              +------+------+                         |
                     |                                |
                     | Repair verified                v
                     v                         +-------------+
              +-------------+                  |  Rejected   |
              |  Resolved   |                  +-------------+
              +-------------+
```

### Valid Transition Table
| Current State | Permitted Next States | Authorized Roles | Preconditions / Rules |
| :--- | :--- | :--- | :--- |
| `draft` | `submitted` | Field Worker | All mandatory fields validated; client UUID set. |
| `submitted` | `assigned`, `rejected` | Coordinator | Must designate technician if assigning; reason $\ge 10$ chars if rejecting. |
| `assigned` | `in_progress`, `rejected` | Coordinator | Updates version; logs assignment event. |
| `in_progress` | `resolved`, `rejected` | Coordinator | Resolution summary or rejection reason recorded. |
| `resolved` | *Terminal* | None | Record is locked. Only super-admin override. |
| `rejected` | *Terminal* | None | Record is locked with rejection reason. |

---

## 8. REST API Contract & Specification

All responses adhere to standardized JSON envelopes:
- **Success Envelope**: `{ "success": true, "data": { ... }, "meta": { "timestamp": "...", "version": 1 } }`
- **Error Envelope**: `{ "success": false, "error": { "code": "...", "message": "...", "details": [] } }`

### Endpoints Overview
1. `GET /api/v1/health`
   - Purpose: Lightweight reachability probe for active connection detection.
   - Auth: Public.
   - Response: `200 OK { "status": "healthy", "time": "..." }`.

2. `GET /api/v1/auth/me`
   - Purpose: Retrieve current authenticated profile, role, and organization.
   - Auth: Required (`Bearer <JWT>`).

3. `POST /api/v1/reports`
   - Purpose: Submit a single report (idempotent on `client_id`).
   - Auth: Field Worker or Coordinator.
   - Body:
     ```json
     {
       "client_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
       "category": "water_infrastructure",
       "title": "Main Pipeline Leak at Sector 4 Borehole",
       "description": "High pressure pipe ruptured, flooding access road.",
       "location_name": "Sector 4 North Water Point",
       "latitude": -1.286389,
       "longitude": 36.817223,
       "accuracy_meters": 4.2,
       "priority": "critical",
       "photo_data": "data:image/jpeg;base64,...",
       "reported_at": "2026-11-12T08:30:00.000Z"
     }
     ```
   - Response: `201 Created` with report record, or `200 OK` if duplicate `client_id` already persisted.

4. `POST /api/v1/sync/batch`
   - Purpose: Batch drain endpoint for syncing multiple offline reports in one call.
   - Auth: Field Worker or Coordinator.
   - Response: `200 OK { "processed": 3, "results": [{ "client_id": "...", "status": "created", "id": "..." }] }`.

5. `GET /api/v1/reports`
   - Purpose: Paginated list with filtering (`status`, `priority`, `category`, `search`).
   - Auth: Field Worker (filtered to own) or Coordinator (all).

6. `GET /api/v1/reports/:id` & `GET /api/v1/reports/:id/history`
   - Purpose: Fetch complete report details, photo URLs, and append-only activity history.

7. `PATCH /api/v1/reports/:id/status`
   - Purpose: Transition status according to finite state machine.
   - Auth: Coordinator only.
   - Body: `{ "status": "assigned", "assigned_to": "<UUID>", "version": 1, "note": "Assigned to regional crew" }`.

8. `GET /api/v1/dashboard/stats`
   - Purpose: Metrics for counts, pending syncs, resolved rates, priority breakdown, and SLA times.

---

## 9. Folder Structure & Code Organization

```
/
├── AGENTS.md                  # Persistent developer rules & graduation project mission
├── metadata.json              # Applet metadata, capabilities & permissions
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript configuration
├── vite.config.ts             # Vite configuration with React & Tailwind
├── index.html                 # HTML entry point with viewport & SEO meta
├── server.ts                  # Express.js backend server entry point (port 3000)
├── src/
│   ├── main.tsx               # Client entry point
│   ├── App.tsx                # App routing & provider shell
│   ├── index.css              # Global styles, Tailwind v4 @import & @custom-variant dark
│   ├── api/                   # Typed API service client layer
│   │   ├── client.ts          # Central Axios / fetch wrapper with error envelope parser
│   │   ├── reports.ts         # Report CRUD & status transition calls
│   │   ├── sync.ts            # Batch synchronization endpoints
│   │   └── auth.ts            # Authentication & profile endpoints
│   ├── db/                    # IndexedDB persistence (Dexie.js)
│   │   ├── index.ts           # Dexie database class & table definitions
│   │   └── reportRepository.ts# Local report CRUD & queue mutations
│   ├── context/               # Global state providers
│   │   ├── AuthContext.tsx    # User session, role, login/logout, profile
│   │   ├── SyncContext.tsx    # Active probe, network status, queue manager
│   │   └── ThemeContext.tsx   # Light/dark mode toggle with localStorage cache
│   ├── hooks/                 # Custom React hooks
│   │   ├── useNetworkStatus.ts# Active probe monitor hook
│   │   ├── useReports.ts      # Query hook with local cache fallback
│   │   └── useGeolocation.ts  # Sensor hook with accuracy indicators
│   ├── components/            # Reusable UI component library
│   │   ├── layout/            # TopNav, Sidebar, BottomNav (mobile), Footer
│   │   ├── common/            # Buttons, Inputs, SegmentedTabs, Modals, EmptyStates
│   │   ├── sync/              # SyncStatusBadge, OfflineBanner, QueueDrawer
│   │   └── reports/           # ReportCard, StatusSelector, PriorityBadge, PhotoUpload
│   ├── pages/                 # Full screen views
│   │   ├── LandingPage.tsx    # Welcome, system overview, role switcher
│   │   ├── LoginPage.tsx      # Sign in form with demo credentials quick-fill
│   │   ├── RegisterPage.tsx   # Field worker self-registration
│   │   ├── WorkerDashboard.tsx# Field worker hub: drafts, my reports, sync status
│   │   ├── CreateReportPage.tsx# New report form: camera/photo, GPS, offline save
│   │   ├── ReportDetailPage.tsx# Details, photo view, activity timeline
│   │   ├── CoordDashboard.tsx # Coordinator control room: triage KPIs, filter grid
│   │   └── ActivityHistoryPage.tsx # System-wide audit log
│   ├── types/                 # Shared TypeScript interfaces & enums
│   │   ├── report.ts
│   │   ├── user.ts
│   │   └── sync.ts
│   └── utils/                 # Utilities (UUID, formatters, validation schemas)
└── server/                    # Express backend modules
    ├── routes/                # Health, Auth, Reports, Sync, Dashboard routes
    ├── middleware/            # Auth, RBAC, Validation, Error Handler
    ├── controllers/           # Endpoint controllers
    └── services/              # Supabase database query services
```

---

## 10. Testing Strategy & Quality Assurance

### 10.1 Unit Tests
- **Zod Validation**: Validates all report payloads (e.g. title length, valid coordinates, valid categories).
- **State Machine Invariants**: Asserts that forbidden transitions (e.g., `Draft` $\to$ `Resolved` directly) throw `400 Bad Request`.
- **Idempotency Logic**: Verifies that duplicate `client_id` inputs return `200 OK` with existing record, not duplicate inserts.
- **Jitter & Backoff Math**: Tests exponential backoff bounds and randomized jitter ranges.

### 10.2 Offline & Resilience Test Scenarios
1. **Offline Persistence**: Worker creates report while network is toggled off $\to$ verify record in IndexedDB $\to$ hard browser reload $\to$ report remains intact in "Pending" queue.
2. **Auto-Recovery**: Network reconnected $\to$ health probe detects live endpoint $\to$ pending queue drains $\to$ report marked "Synchronized" $\to$ verified in Coordinator view.
3. **Flaky Connection & Duplication Shield**: Request simulated to drop mid-flight $\to$ retry issued with identical `client_id` $\to$ database enforces `UNIQUE` constraint, zero duplicate rows created.
4. **Photo Attachment**: Worker snaps high-res photo offline $\to$ stored in IndexedDB Blob $\to$ syncs as multipart/base64 payload $\to$ accessible via preview modal.

---

## 11. Risk & Edge-Case Analysis

| Risk / Edge Case | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Captive Portal / Dead Wi-Fi** | False-positive `navigator.onLine` causes repeated failed requests | Active HTTP probe to `/api/v1/health` with 3s timeout before draining queue. |
| **Simultaneous Edit by Two Coordinators** | Overwriting notes or concurrent status jumps | Optimistic locking using integer `version` column (`WHERE id = :id AND version = :version`). |
| **IndexedDB Quota Exceeded** | Device storage runs out on large photos | Client-side image compression (max 1280px width, JPEG 0.75 quality) before saving Blob to IndexedDB. |
| **Unauthorized Role Escalation** | Field worker attempts coordinator triage actions | Role checks enforced in both PostgreSQL RLS policies and Express JWT middleware. |
| **Browser Process Terminated During Sync** | Inconsistent sync status | Reports remain in `pending` or `synchronizing` until explicit server acknowledgement is returned; automatic restart on next boot. |

---

## 12. Vertical Slice Implementation Roadmap

- **Slice 1: Foundation & Navigation**: Tailwind v4 dual-theme styling, TopBar contract, BottomNav mobile bar, routing, and role-switcher.
- **Slice 2: Local Persistence & Dexie.js Store**: IndexedDB schema, repository methods, and local draft saving.
- **Slice 3: Field Worker Report Creation**: Camera/photo input, GPS geolocation detector, category/priority picker, and offline save.
- **Slice 4: Active Health Probe & Sync Engine**: Background auto-sync, manual retry, exponential backoff, and toast notifications.
- **Slice 5: Coordinator Dashboard & Triage**: High-density data grid, search, multi-filter, and metric summary cards.
- **Slice 6: Finite State Machine & Assignment**: Status transition drawer, technician assignment, mandatory rejection reasoning, and optimistic version locking.
- **Slice 7: Append-Only Activity Log & Audit Trail**: Timeline renderer for report history, sync events, and coordinator comments.
- **Slice 8: Express Backend & Verification**: Full API routes, Zod schemas, health probe endpoint, and automated test suite.
