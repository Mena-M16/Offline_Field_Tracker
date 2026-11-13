# AGENTS.md — Persistent Developer & AI System Instructions

**Project:** Offline Field Issue Tracker (Graduation Project)  
**Version:** 1.0.0  
**Target Environment:** Node.js (Express), React (Vite, Tailwind CSS), Supabase (PostgreSQL, Auth), IndexedDB (Dexie.js)

---

## 1. Project Context & Mission

The **Offline Field Issue Tracker** is a mission-critical, offline-first web application enabling field workers to document infrastructure problems (e.g. broken water points, damaged electrical infrastructure, equipment failures, service interruptions, and safety concerns) in remote or low-connectivity environments.

### Core Problem
Field workers operate in regions with unreliable or non-existent cellular connectivity. Traditional web applications fail when disconnected, causing loss of critical inspection data. 

### Core Solution
1. **Offline Capture:** Reports are created, validated, and stored locally in IndexedDB immediately upon creation.
2. **Deterministic Idempotency:** Each report is assigned a persistent client UUID (`client_id`) upon creation to prevent duplicates during sync retries.
3. **Queue & Auto-Sync:** A background synchronization engine detects real server connectivity (via active health probes, not just `navigator.onLine`) and drains pending reports with exponential backoff and jitter.
4. **Coordinator Triage:** Coordinators review, filter, assign, and update report statuses through an enforced lifecycle state machine with immutable activity logging.
5. **Zero Data Loss Guarantee:** No local report is deleted or modified until the server acknowledges persistence.

---

## 2. Technology Stack

- **Frontend:**
  - React 19 / 18+ (Functional components with hooks)
  - Vite (Build tool & dev server)
  - Tailwind CSS v4 (Modern responsive utility styling, dark/light contrast)
  - Lucide React (Accessible iconography)
  - Motion for React (`motion` / Framer Motion for smooth transitions)
  - Dexie.js (IndexedDB wrapper for durable local persistence)
- **Backend:**
  - Node.js & Express.js (REST API service)
  - Zod (Schema validation for payloads & parameters)
  - Helmet & CORS (Security headers & origin restrictions)
- **Database & Authentication:**
  - Supabase PostgreSQL (Normalized relational tables, check constraints, foreign keys)
  - Supabase GoTrue Auth (JWT issuance & session verification)
  - PostgreSQL Row Level Security (RLS) (Database-level multi-tenant isolation)
- **Testing:**
  - Vitest, React Testing Library, and Supertest

---

## 3. Architecture Decisions & Mandatory Constraints

1. **IndexedDB is Mandatory:** Local storage must use IndexedDB via Dexie.js. `localStorage` is strictly prohibited for offline report caching or queue storage due to synchronous I/O blocking and 5MB storage limits.
2. **Client-Generated UUID v4 (`client_id`):** Every report must receive a persistent UUID v4 immediately upon creation in the client. This ID travels with the report and is enforced as a `UNIQUE` index in PostgreSQL to ensure zero duplicate records on sync retry.
3. **Zero Data Loss Rule:** No local report may be purged or marked `synchronized` until the backend returns an explicit HTTP 200/201/207 acknowledging persistence.
4. **Active Health Probe:** Do not rely solely on `navigator.onLine` (which frequently misreports captive portals or dead Wi-Fi). Network connectivity must be verified via an active `HEAD /api/v1/health` or `GET /api/v1/health` probe with a 3-second timeout before draining the sync queue.
5. **Exponential Backoff with Full Jitter:** Failed sync attempts must back off exponentially ($T_{\text{delay}} = \min(60\text{s}, 2\text{s} \times 2^{\text{attempt}}) \times (1 \pm 0.2)$) to prevent server thundering herds when connectivity returns.
6. **Strict State Machine:** Report transitions must obey:  
   `Draft` -> `Submitted` -> `Assigned` -> `In Progress` -> `Resolved`.  
   `Rejected` is permitted from `Submitted`, `Assigned`, or `In Progress` with a mandatory reason ($\ge 10$ characters). Arbitrary jumps are rejected by both client and backend validation.
7. **Role-Based Access Control (RBAC):**
   - `field_worker`: Creates reports, views own reports, triggers sync.
   - `coordinator`: Views all reports, assigns technicians, transitions status, reviews analytics.
   - Public registration endpoints only assign `field_worker`. Coordinator accounts are provisioned via administrative seeds.

---

## 4. Coding Conventions & Code Organization

- **Modularity:** Separate components, pages, context, hooks, API services, and IndexedDB operations into distinct directories.
- **Single API Layer:** UI components must never invoke raw `fetch` directly; all requests flow through typed API service functions in `/src/api/`.
- **Validation:** Validate all incoming requests on the backend using Zod schemas before hitting controllers.
- **Error Handling:** All backend endpoints return standardized JSON envelopes:
  - Success: `{ "success": true, "data": { ... }, "meta": { "timestamp": "..." } }`
  - Error: `{ "success": false, "error": { "code": "...", "message": "...", "details": [] } }`
- **Defensive Database Queries:** Use parameterized SQL queries or the Supabase SDK client. Never concatenate raw strings into SQL.
- **No Private Secrets in Client:** `SUPABASE_SERVICE_ROLE_KEY` must never be referenced in frontend code or Vite environment variables (`VITE_`).

---

## 5. Security & Data Safety Rules

1. **Row Level Security (RLS):** Every PostgreSQL table (`profiles`, `reports`, `activity_logs`, `sync_logs`) must have RLS enabled with explicit policies.
2. **Immutable Audit Logs:** The `activity_logs` table is append-only. No `UPDATE` or `DELETE` operations are permitted.
3. **Optimistic Locking:** Status updates enforce version matching (`WHERE id = :id AND version = :expected_version`) to prevent concurrent coordinator overwrites.
4. **CORS:** The Express API must strictly whitelist the frontend origin in production.

---

## 6. Development Workflow: Vertical Slice Discipline

Never generate large monolithic blocks of unverified code. Development proceeds in small, testable vertical slices:
1. **Explain the plan:** Detail files to create/modify and acceptance criteria.
2. **Inspect existing files:** Check current state before modifying.
3. **Implement the slice:** Clean, modular, well-commented code.
4. **Test & Verify:** Run unit, integration, or browser verification.
5. **Report & Wait:** Present verification results and wait for explicit approval before moving to the next slice.
