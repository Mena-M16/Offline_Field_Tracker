import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import { z } from 'zod';
import { toApiErrorPayload } from './src/lib/databaseErrors';
import { SupabaseProfileRepository } from './src/repositories/supabaseProfileRepository';
import { getServerEnvSummary } from './src/server/env';
import { requireAuth, type AuthenticatedRequest } from './src/server/middleware/auth';

interface ServerReport {
  id: string;
  client_id: string;
  created_by: string;
  creator_name: string;
  assigned_to?: string;
  assignee_name?: string;
  category: string;
  title: string;
  description: string;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  priority: string;
  status: string;
  rejection_reason?: string;
  photo_url?: string;
  audio_url?: string;
  reported_at: string;
  created_at: string;
  updated_at: string;
  version: number;
}

interface ServerActivityLog {
  id: string;
  report_id: string;
  client_id?: string;
  actor_id?: string;
  actor_name: string;
  actor_role: string;
  event_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

const createReportSchema = z.object({
  client_id: z.string().min(8, 'Valid client_id is required'),
  created_by: z.string().optional(),
  creator_name: z.string().optional(),
  category: z.enum([
    'water_infrastructure',
    'equipment_damage',
    'service_interruption',
    'safety_concern',
    'maintenance',
    'other',
  ]),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  location_name: z.string().min(2, 'Location name is required'),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  accuracy_meters: z.number().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.enum(['draft', 'submitted', 'assigned', 'in_progress', 'resolved', 'rejected']).optional(),
  photo_url: z.string().optional(),
  audio_url: z.string().optional(),
  reported_at: z.string().optional(),
});

const batchSyncSchema = z.object({
  reports: z.array(createReportSchema).max(100),
});

const statusTransitionSchema = z.object({
  status: z.enum(['submitted', 'assigned', 'in_progress', 'resolved', 'rejected']),
  assigned_to: z.string().optional(),
  assignee_name: z.string().optional(),
  rejection_reason: z.string().optional(),
  expected_version: z.number().int().positive().optional(),
  note: z.string().optional(),
  actor_name: z.string().optional(),
});

const updateProfileSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(120).optional(),
    phone_number: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

// In-memory persistent database store on the backend (prototype store before Supabase PostgreSQL)
const reportsDatabase: Map<string, ServerReport> = new Map();
const activityLogsDatabase: ServerActivityLog[] = [];

const seedInitialServerReports = () => {
  const initial: ServerReport[] = [
    {
      id: 'srv-rep-101',
      client_id: 'b148e234-90a1-4389-98a2-7fa345100001',
      created_by: 'worker-samuel-id',
      creator_name: 'Samuel Kiprop',
      assigned_to: 'worker-samuel-id',
      assignee_name: 'Samuel Kiprop (North Ward Crew)',
      category: 'water_infrastructure',
      title: 'Solar Borehole Submersible Pump Inverter Failure',
      description: 'The solar inverter for Borehole #4 in Sector 3 is tripping with Error code E-04 (Overvoltage). Community water tank is down to 15% capacity; approximately 450 residents affected.',
      location_name: 'Sector 3 Borehole Pumping Station, North Ward',
      latitude: -1.286389,
      longitude: 36.817223,
      accuracy_meters: 3.5,
      priority: 'critical',
      status: 'in_progress',
      reported_at: new Date(Date.now() - 14 * 3600000).toISOString(),
      created_at: new Date(Date.now() - 14 * 3600000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 3600000).toISOString(),
      version: 3,
    },
    {
      id: 'srv-rep-102',
      client_id: 'c259f345-a1b2-5490-a9b3-8ab456200002',
      created_by: 'worker-samuel-id',
      creator_name: 'Samuel Kiprop',
      assigned_to: 'coord-elena-id',
      assignee_name: 'Elena Morales (Dispatch)',
      category: 'equipment_damage',
      title: 'Pole-Mounted Distribution Transformer Oil Leakage',
      description: 'Heavy mineral dielectric oil dripping steadily from the high-voltage bushing seal of Transformer TR-09. Ground contamination risk and potential overheating under peak load.',
      location_name: 'Feeder Line 4B, Junction Old Quarry Road',
      latitude: -1.29152,
      longitude: 36.82411,
      accuracy_meters: 4.8,
      priority: 'high',
      status: 'assigned',
      reported_at: new Date(Date.now() - 24 * 3600000).toISOString(),
      created_at: new Date(Date.now() - 24 * 3600000).toISOString(),
      updated_at: new Date(Date.now() - 5 * 3600000).toISOString(),
      version: 2,
    },
    {
      id: 'srv-rep-105',
      client_id: 'f582c678-d4e5-8723-dce6-1de789500005',
      created_by: 'worker-samuel-id',
      creator_name: 'Samuel Kiprop',
      assigned_to: 'worker-samuel-id',
      assignee_name: 'Samuel Kiprop',
      category: 'service_interruption',
      title: 'Branch Pipeline Rupture Isolated and Flushed',
      description: 'High-density polyethylene 90mm feeder burst due to contractor trench excavation. Replaced 6m pipe section, installed double-socket coupling, disinfected with chlorine tablet.',
      location_name: 'Market Road Cross-Section, Zone A',
      latitude: -1.27891,
      longitude: 36.81155,
      accuracy_meters: 1.8,
      priority: 'high',
      status: 'resolved',
      reported_at: new Date(Date.now() - 72 * 3600000).toISOString(),
      created_at: new Date(Date.now() - 72 * 3600000).toISOString(),
      updated_at: new Date(Date.now() - 24 * 3600000).toISOString(),
      version: 4,
    },
  ];

  initial.forEach((r) => reportsDatabase.set(r.client_id, r));
};

seedInitialServerReports();

function findReportByIdOrClientId(id: string): ServerReport | undefined {
  for (const rep of reportsDatabase.values()) {
    if (rep.id === id || rep.client_id === id) {
      return rep;
    }
  }
  return undefined;
}

async function startServer() {
  const serverEnv = getServerEnvSummary();
  if (serverEnv.validationErrors.length > 0) {
    console.warn('[FieldTrack] Environment validation warnings:', serverEnv.validationErrors);
  }

  const app = express();
  const PORT = serverEnv.port;
  const corsOrigins = serverEnv.corsOrigins;

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors(
      corsOrigins
        ? { origin: corsOrigins, credentials: true }
        : { origin: true, credentials: true }
    )
  );

  // JSON parser with 10MB limit for base64 photo/audio payloads
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.path.startsWith('/api')) {
        console.log(`[API] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
      }
    });
    next();
  });

  // 1. Active Reachability Probe
  app.get('/api/v1/health', (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'healthy',
        service: 'offline-field-issue-tracker-backend',
        supabase_configured: Boolean(serverEnv.supabasePublic),
        timestamp: new Date().toISOString(),
      },
      meta: { timestamp: new Date().toISOString() },
    });
  });

  // 2. Auth Profile Endpoints (JWT-verified + PostgreSQL RLS backed)
  app.get('/api/v1/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.status(200).json({
      success: true,
      data: req.auth!.profile,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  app.patch('/api/v1/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Profile update payload failed validation.',
          details: parsed.error.issues,
        },
      });
    }

    try {
      const profileRepo = new SupabaseProfileRepository(req.auth!.supabase);
      const updated = await profileRepo.updateOwnProfile(req.auth!.userId, {
        ...(parsed.data.full_name !== undefined ? { full_name: parsed.data.full_name } : {}),
        ...(parsed.data.phone_number !== undefined
          ? { phone_number: parsed.data.phone_number ?? '' }
          : {}),
      });

      res.status(200).json({
        success: true,
        data: updated,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (err) {
      const apiErr = toApiErrorPayload(err);
      res.status(apiErr.status).json(apiErr.body);
    }
  });

  // 3. List Reports
  app.get('/api/v1/reports', (req: Request, res: Response) => {
    const reports = Array.from(reportsDatabase.values());
    res.status(200).json({
      success: true,
      data: reports,
      meta: {
        total: reports.length,
        timestamp: new Date().toISOString(),
      },
    });
  });

  // 3b. Get Single Report
  app.get('/api/v1/reports/:id', (req: Request, res: Response) => {
    const report = findReportByIdOrClientId(req.params.id);
    if (!report) {
      return res.status(404).json({
        success: false,
        error: { code: 'REPORT_NOT_FOUND', message: `Report ${req.params.id} not found.` },
      });
    }
    res.status(200).json({
      success: true,
      data: report,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  // 3c. Get Report Activity History
  app.get('/api/v1/reports/:id/history', (req: Request, res: Response) => {
    const report = findReportByIdOrClientId(req.params.id);
    const logs = activityLogsDatabase.filter(
      (l) => l.report_id === req.params.id || l.client_id === req.params.id || (report && l.client_id === report.client_id)
    );
    res.status(200).json({
      success: true,
      data: logs,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  // 3d. List Global Activity Logs
  app.get('/api/v1/activity-logs', (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: activityLogsDatabase,
      meta: { total: activityLogsDatabase.length, timestamp: new Date().toISOString() },
    });
  });

  // 4. Ingest Single Report (Deterministic Idempotency on client_id)
  app.post('/api/v1/reports', (req: Request, res: Response) => {
    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Report payload failed schema validation.',
          details: parsed.error.issues,
        },
      });
    }

    const payload = parsed.data;
    const clientId = payload.client_id;

    if (reportsDatabase.has(clientId)) {
      const existing = reportsDatabase.get(clientId);
      return res.status(200).json({
        success: true,
        data: existing,
        meta: { idempotency_hit: true, timestamp: new Date().toISOString() },
      });
    }

    const newId = `srv-rep-${Math.floor(Math.random() * 90000 + 10000)}`;
    const nowStr = new Date().toISOString();

    const newReport: ServerReport = {
      id: newId,
      client_id: clientId,
      created_by: payload.created_by || 'worker-samuel-id',
      creator_name: payload.creator_name || 'Samuel Kiprop',
      category: payload.category,
      title: payload.title,
      description: payload.description,
      location_name: payload.location_name,
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      accuracy_meters: payload.accuracy_meters ?? null,
      priority: payload.priority,
      status: payload.status === 'draft' ? 'submitted' : payload.status || 'submitted',
      photo_url: payload.photo_url,
      audio_url: payload.audio_url,
      reported_at: payload.reported_at || nowStr,
      created_at: nowStr,
      updated_at: nowStr,
      version: 1,
    };

    reportsDatabase.set(clientId, newReport);

    activityLogsDatabase.push({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      report_id: newId,
      client_id: clientId,
      actor_id: newReport.created_by,
      actor_name: newReport.creator_name,
      actor_role: 'field_worker',
      event_type: 'report_created',
      details: { note: 'Report ingested and persisted via central REST API.' },
      created_at: nowStr,
    });

    res.status(201).json({
      success: true,
      data: newReport,
      meta: { timestamp: nowStr },
    });
  });

  // 5. Batch Synchronization Drain Endpoint
  app.post('/api/v1/sync/batch', (req: Request, res: Response) => {
    const parsed = batchSyncSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Batch sync payload failed validation.',
          details: parsed.error.issues,
        },
      });
    }

    const reportsList = parsed.data.reports;
    const results: Array<{ client_id: string; server_id: string; status: 'created' | 'already_synced' }> = [];

    for (const r of reportsList) {
      if (reportsDatabase.has(r.client_id)) {
        const existing = reportsDatabase.get(r.client_id)!;
        results.push({
          client_id: r.client_id,
          server_id: existing.id,
          status: 'already_synced',
        });
      } else {
        const newId = `srv-rep-${Math.floor(Math.random() * 90000 + 10000)}`;
        const nowStr = new Date().toISOString();
        const saved: ServerReport = {
          id: newId,
          client_id: r.client_id,
          created_by: r.created_by || 'worker-samuel-id',
          creator_name: r.creator_name || 'Samuel Kiprop',
          category: r.category,
          title: r.title,
          description: r.description,
          location_name: r.location_name,
          latitude: r.latitude ?? null,
          longitude: r.longitude ?? null,
          accuracy_meters: r.accuracy_meters ?? null,
          priority: r.priority,
          status: r.status === 'draft' ? 'submitted' : r.status || 'submitted',
          photo_url: r.photo_url,
          audio_url: r.audio_url,
          reported_at: r.reported_at || nowStr,
          created_at: nowStr,
          updated_at: nowStr,
          version: 1,
        };
        reportsDatabase.set(r.client_id, saved);
        activityLogsDatabase.push({
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          report_id: newId,
          client_id: r.client_id,
          actor_id: saved.created_by,
          actor_name: saved.creator_name,
          actor_role: 'field_worker',
          event_type: 'sync_completed',
          details: { note: `Batch sync persisted '${saved.title}' with idempotency key.` },
          created_at: nowStr,
        });
        results.push({
          client_id: r.client_id,
          server_id: newId,
          status: 'created',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        processed: results.length,
        results,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  });

  // 6. Status Workflow & State Machine Endpoint
  app.patch('/api/v1/reports/:id/status', (req: Request, res: Response) => {
    const parsed = statusTransitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Status transition payload failed validation.',
          details: parsed.error.issues,
        },
      });
    }

    const { id } = req.params;
    const {
      status: nextStatus,
      assigned_to,
      assignee_name,
      rejection_reason,
      expected_version,
      note,
      actor_name,
    } = parsed.data;

    const targetReport = findReportByIdOrClientId(id);
    if (!targetReport) {
      return res.status(404).json({
        success: false,
        error: { code: 'REPORT_NOT_FOUND', message: `Report ${id} not found.` },
      });
    }

    if (expected_version !== undefined && targetReport.version !== expected_version) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'VERSION_CONFLICT',
          message: `Report version conflict: expected v${expected_version}, current is v${targetReport.version}. Refresh before retrying.`,
        },
      });
    }

    const validTransitions: Record<string, string[]> = {
      draft: ['submitted'],
      submitted: ['assigned', 'rejected'],
      assigned: ['in_progress', 'rejected'],
      in_progress: ['resolved', 'rejected'],
    };

    const allowed = validTransitions[targetReport.status] || [];
    if (!allowed.includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot transition from '${targetReport.status}' to '${nextStatus}'. Permitted: [${allowed.join(', ')}]`,
        },
      });
    }

    if (nextStatus === 'rejected' && (!rejection_reason || rejection_reason.trim().length < 10)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REJECTION_REASON',
          message: 'Rejection requires a mandatory explanation of at least 10 characters.',
        },
      });
    }

    const previousStatus = targetReport.status;
    targetReport.status = nextStatus;
    targetReport.version += 1;
    targetReport.updated_at = new Date().toISOString();
    if (assigned_to) {
      targetReport.assigned_to = assigned_to;
      targetReport.assignee_name = assignee_name || assigned_to;
    }
    if (rejection_reason) {
      targetReport.rejection_reason = rejection_reason;
    }

    activityLogsDatabase.push({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      report_id: targetReport.id,
      client_id: targetReport.client_id,
      actor_name: actor_name || 'Elena Morales',
      actor_role: 'coordinator',
      event_type:
        nextStatus === 'rejected'
          ? 'report_rejected'
          : nextStatus === 'assigned'
          ? 'report_assigned'
          : 'status_changed',
      details: {
        previous_status: previousStatus,
        new_status: nextStatus,
        assigned_to,
        assignee_name: targetReport.assignee_name,
        reason: rejection_reason,
        note,
      },
      created_at: targetReport.updated_at,
    });

    res.status(200).json({
      success: true,
      data: targetReport,
      meta: { timestamp: targetReport.updated_at, version: targetReport.version },
    });
  });

  // 7. Dashboard Stats Endpoint
  app.get('/api/v1/dashboard/stats', (req: Request, res: Response) => {
    const all = Array.from(reportsDatabase.values());
    const stats = {
      total_reports: all.length,
      pending_sync: 0,
      submitted: all.filter((r) => r.status === 'submitted').length,
      assigned: all.filter((r) => r.status === 'assigned').length,
      in_progress: all.filter((r) => r.status === 'in_progress').length,
      resolved: all.filter((r) => r.status === 'resolved').length,
      rejected: all.filter((r) => r.status === 'rejected').length,
      critical_count: all.filter((r) => r.priority === 'critical' && r.status !== 'resolved' && r.status !== 'rejected').length,
    };
    res.status(200).json({
      success: true,
      data: stats,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  // Mount Vite Middleware for SPA serving in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FieldTrack] Express API + Vite SPA listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[FieldTrack] Server failed to start:', err);
  process.exit(1);
});
