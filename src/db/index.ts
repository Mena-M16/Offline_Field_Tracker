import Dexie, { type Table } from 'dexie';
import type { LocalReport, ActivityLog } from '../types';

export class IssueTrackerDatabase extends Dexie {
  reports!: Table<LocalReport, number>;
  activityLogs!: Table<ActivityLog, string>;

  constructor() {
    super('OfflineFieldTrackerDB');
    this.version(1).stores({
      reports: '++id, client_id, server_id, status, sync_status, created_by, category, priority, reported_at, updated_at',
      activityLogs: 'id, report_id, client_id, actor_id, event_type, created_at',
    });
  }
}

export const db = new IssueTrackerDatabase();

// Realistic initial demo seed data with rich infrastructure scenarios
export async function seedInitialDatabaseIfEmpty() {
  const count = await db.reports.count();
  if (count > 0) return;

  const now = new Date();
  const subMinutes = (mins: number) => new Date(now.getTime() - mins * 60000).toISOString();
  const subHours = (hrs: number) => new Date(now.getTime() - hrs * 3600000).toISOString();
  const subDays = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();

  const initialReports: LocalReport[] = [
    {
      client_id: 'b148e234-90a1-4389-98a2-7fa345100001',
      server_id: 'srv-rep-101',
      created_by: 'worker-samuel-id',
      creator_name: 'Samuel Kiprop',
      assigned_to: 'worker-samuel-id',
      assignee_name: 'Samuel Kiprop',
      category: 'water_infrastructure',
      title: 'Solar Borehole Submersible Pump Inverter Failure',
      description: 'The solar inverter for Borehole #4 in Sector 3 is tripping with Error code E-04 (Overvoltage). Community water tank is down to 15% capacity; approximately 450 residents affected.',
      location_name: 'Sector 3 Borehole Pumping Station, North Ward',
      latitude: -1.286389,
      longitude: 36.817223,
      accuracy_meters: 3.5,
      priority: 'critical',
      status: 'in_progress',
      sync_status: 'synchronized',
      photo_url: '/src/assets/images/water_borehole_pump_1794502059708.jpg',
      reported_at: subHours(14),
      created_at: subHours(14),
      updated_at: subHours(2),
      version: 3,
      sync_attempts: 1,
      last_sync_error: null,
    },
    {
      client_id: 'c259f345-a1b2-5490-a9b3-8ab456200002',
      server_id: 'srv-rep-102',
      created_by: 'worker-samuel-id',
      creator_name: 'Samuel Kiprop',
      assigned_to: 'coord-elena-id',
      assignee_name: 'Elena Morales (Dispatch)',
      category: 'equipment_damage',
      title: 'Pole-Mounted Distribution Transformer Oil Leakage',
      description: 'Heavy mineral dielectric oil dripping steadily from the high-voltage bushing seal of Transformer TR-09. Ground contamination risk and potential overheating under peak load.',
      location_name: 'Feeder Line 4B, Junction Old Quarry Road',
      latitude: -1.291520,
      longitude: 36.824110,
      accuracy_meters: 4.8,
      priority: 'high',
      status: 'assigned',
      sync_status: 'synchronized',
      photo_url: '/src/assets/images/power_grid_substation_1794502060514.jpg',
      reported_at: subDays(1),
      created_at: subDays(1),
      updated_at: subHours(5),
      version: 2,
      sync_attempts: 1,
      last_sync_error: null,
    },
    {
      client_id: 'd360a456-b2c3-6501-bac4-9bc567300003',
      server_id: undefined,
      created_by: 'worker-samuel-id',
      creator_name: 'Samuel Kiprop',
      category: 'safety_concern',
      title: 'Uncovered Main Sluice Valve Pit Near Primary School',
      description: 'Cast-iron inspection lid missing from 1.8-meter deep gate valve chamber directly beside pedestrian path. Poses immediate fall hazard for children. Temporarily marked with red caution tape.',
      location_name: 'Kilimani Primary Access Lane, Sector 2',
      latitude: -1.298110,
      longitude: 36.789220,
      accuracy_meters: 2.1,
      priority: 'critical',
      status: 'submitted',
      sync_status: 'pending', // Pending offline sync demo
      photo_url: '/src/assets/images/hero_field_inspection_1794502044492.jpg',
      reported_at: subMinutes(25),
      created_at: subMinutes(25),
      updated_at: subMinutes(25),
      version: 1,
      sync_attempts: 0,
      last_sync_error: null,
    },
    {
      client_id: 'e471b567-c3d4-7612-cbd5-0cd678400004',
      server_id: undefined,
      created_by: 'worker-samuel-id',
      creator_name: 'Samuel Kiprop',
      category: 'maintenance',
      title: 'Periodic Desilting Needed for Sedimentation Basin',
      description: 'Pre-filtration sediment bed is reaching 80% sediment volume after heavy rains. Water flow rate throttled to 60 liters/minute.',
      location_name: 'Intake Weir 2, River Bend Station',
      latitude: -1.312040,
      longitude: 36.840190,
      accuracy_meters: 6.0,
      priority: 'low',
      status: 'draft',
      sync_status: 'draft', // Local draft
      photo_url: undefined,
      reported_at: subHours(3),
      created_at: subHours(3),
      updated_at: subHours(3),
      version: 1,
      sync_attempts: 0,
      last_sync_error: null,
    },
    {
      client_id: 'f582c678-d4e5-8723-dce6-1de789500005',
      server_id: 'srv-rep-105',
      created_by: 'worker-samuel-id',
      creator_name: 'Samuel Kiprop',
      assigned_to: 'worker-samuel-id',
      assignee_name: 'Samuel Kiprop',
      category: 'service_interruption',
      title: 'Branch Pipeline Rupture Isolated and Flushed',
      description: 'High-density polyethylene 90mm feeder burst due to contractor trench excavation. Replaced 6m pipe section, installed double-socket coupling, disinfected with chlorine tablet.',
      location_name: 'Market Road Cross-Section, Zone A',
      latitude: -1.278910,
      longitude: 36.811550,
      accuracy_meters: 1.8,
      priority: 'high',
      status: 'resolved',
      sync_status: 'synchronized',
      photo_url: '/src/assets/images/hero_field_inspection_1794502044492.jpg',
      reported_at: subDays(3),
      created_at: subDays(3),
      updated_at: subDays(1),
      version: 4,
      sync_attempts: 1,
      last_sync_error: null,
    },
  ];

  await db.reports.bulkAdd(initialReports);

  const initialLogs: ActivityLog[] = [
    {
      id: 'log-001',
      report_id: 'srv-rep-101',
      client_id: 'b148e234-90a1-4389-98a2-7fa345100001',
      actor_id: 'worker-samuel-id',
      actor_name: 'Samuel Kiprop',
      actor_role: 'field_worker',
      event_type: 'report_created',
      details: { note: 'Initial field report created via mobile terminal with GPS fix.' },
      created_at: subHours(14),
    },
    {
      id: 'log-002',
      report_id: 'srv-rep-101',
      client_id: 'b148e234-90a1-4389-98a2-7fa345100001',
      actor_id: 'coord-elena-id',
      actor_name: 'Elena Morales',
      actor_role: 'coordinator',
      event_type: 'report_assigned',
      details: {
        assigned_to: 'worker-samuel-id',
        assignee_name: 'Samuel Kiprop',
        note: 'Assigned to North Ward rapid response technician team.',
      },
      created_at: subHours(10),
    },
    {
      id: 'log-003',
      report_id: 'srv-rep-101',
      client_id: 'b148e234-90a1-4389-98a2-7fa345100001',
      actor_id: 'coord-elena-id',
      actor_name: 'Elena Morales',
      actor_role: 'coordinator',
      event_type: 'status_changed',
      details: {
        previous_status: 'assigned',
        new_status: 'in_progress',
        note: 'Replacement 5kW solar inverter sourced from central depot, technician en route.',
      },
      created_at: subHours(2),
    },
    {
      id: 'log-004',
      report_id: 'pending-003',
      client_id: 'd360a456-b2c3-6501-bac4-9bc567300003',
      actor_id: 'worker-samuel-id',
      actor_name: 'Samuel Kiprop',
      actor_role: 'field_worker',
      event_type: 'report_saved_offline',
      details: { note: 'Report stored in IndexedDB local queue while disconnected from cell tower.' },
      created_at: subMinutes(25),
    },
  ];

  await db.activityLogs.bulkAdd(initialLogs);
}
