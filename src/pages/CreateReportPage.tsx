import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  MapPin,
  Crosshair,
  AlertCircle,
  Save,
  Send,
  ArrowLeft,
  X,
  CheckCircle2,
} from 'lucide-react';
import { reportRepository } from '../db/reportRepository';
import type { LocalReport, ReportCategory, ReportPriority, ActivityLog } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { GeoMapCard } from '../components/common/GeoMapCard';
import { AudioMemoRecorder } from '../components/common/AudioMemoRecorder';

interface CreateReportPageProps {
  editDraftId?: number | null;
  onNavigate: (page: string, reportId?: string | number) => void;
}

async function compressImageFile(file: File, maxDimension = 1280, quality = 0.78): Promise<{ dataUrl: string; blob: Blob }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: reader.result as string, blob: file });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        canvas.toBlob(
          (compressedBlob) => {
            resolve({ dataUrl, blob: compressedBlob || file });
          },
          'image/jpeg',
          quality
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const CreateReportPage: React.FC<CreateReportPageProps> = ({ editDraftId, onNavigate }) => {
  const { user } = useAuth();
  const { isOnline, triggerSyncNow } = useSync();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ReportCategory>('water_infrastructure');
  const [priority, setPriority] = useState<ReportPriority>('medium');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [clientId, setClientId] = useState<string>('');
  const [originalCreatedAt, setOriginalCreatedAt] = useState<string | null>(null);
  const [existingVersion, setExistingVersion] = useState<number>(1);
  const [audioMemo, setAudioMemo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initReport = async () => {
      if (editDraftId) {
        const existing = await reportRepository.getReportByIdOrClientId(editDraftId);
        if (existing) {
          setTitle(existing.title === 'Untitled Draft' ? '' : existing.title);
          setCategory(existing.category);
          setPriority(existing.priority);
          setDescription(existing.description);
          setLocationName(existing.location_name === 'Unspecified location' ? '' : existing.location_name);
          setLatitude(existing.latitude);
          setLongitude(existing.longitude);
          setAccuracy(existing.accuracy_meters);
          setPhotoPreview(existing.photo_url || null);
          setPhotoBlob(existing.photo_blob || null);
          setAudioMemo(existing.audio_url || null);
          setClientId(existing.client_id);
          setOriginalCreatedAt(existing.created_at);
          setExistingVersion(existing.version || 1);
          return;
        }
      }

      const newUuid = crypto.randomUUID();
      setClientId(newUuid);
      detectLocation();
    };

    initReport();
  }, [editDraftId]);

  const detectLocation = () => {
    setGpsStatusMsg(null);
    if (!navigator.geolocation) {
      setGpsStatusMsg('Device geolocation API unavailable. Enter landmark or retry outdoors.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(Number(pos.coords.latitude.toFixed(6)));
        setLongitude(Number(pos.coords.longitude.toFixed(6)));
        setAccuracy(Number(pos.coords.accuracy.toFixed(1)));
        setGpsStatusMsg(null);
        setIsLocating(false);
      },
      () => {
        setGpsStatusMsg('GPS signal unavailable or permission denied. You can still submit using the landmark location or retry GPS.');
        setIsLocating(false);
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveError(null);

    try {
      const { dataUrl, blob } = await compressImageFile(file);
      setPhotoPreview(dataUrl);
      setPhotoBlob(blob);
    } catch {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
      setPhotoBlob(file);
    }
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!title.trim() || title.trim().length < 5) {
      errors.title = 'Title must be at least 5 characters';
    }
    if (!description.trim() || description.trim().length < 15) {
      errors.description = 'Please describe the issue in detail (min 15 characters)';
    }
    if (!locationName.trim() || locationName.trim().length < 3) {
      errors.locationName = 'Location name or landmark is required';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (isDraft: boolean) => {
    setSaveError(null);
    if (!isDraft && !validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const resolvedClientId = clientId || crypto.randomUUID();
      const reportData: LocalReport = {
        client_id: resolvedClientId,
        created_by: user?.id || 'worker-samuel-id',
        creator_name: user?.full_name || 'Samuel Kiprop',
        title: title.trim() || 'Untitled Draft',
        category,
        priority,
        description: description.trim(),
        location_name: locationName.trim() || 'Unspecified location',
        latitude,
        longitude,
        accuracy_meters: accuracy,
        status: isDraft ? 'draft' : 'submitted',
        sync_status: isDraft ? 'draft' : 'pending',
        photo_url: photoPreview || undefined,
        photo_blob: photoBlob || undefined,
        audio_url: audioMemo || undefined,
        reported_at: now,
        created_at: originalCreatedAt || now,
        updated_at: now,
        version: editDraftId ? existingVersion : 1,
        sync_attempts: 0,
        last_sync_error: null,
      };

      await reportRepository.saveReport(reportData, editDraftId || undefined);

      const auditLog: ActivityLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        report_id: `client-${resolvedClientId}`,
        client_id: resolvedClientId,
        actor_id: user?.id || 'worker-samuel-id',
        actor_name: user?.full_name || 'Samuel Kiprop',
        actor_role: 'field_worker',
        event_type: isDraft ? 'report_saved_offline' : isOnline ? 'report_submitted' : 'report_saved_offline',
        details: {
          note: isDraft
            ? 'Draft saved locally to IndexedDB.'
            : isOnline
            ? 'Report submitted; queued for central sync.'
            : 'Offline submission stored securely in device queue.',
        },
        created_at: now,
      };
      await reportRepository.addActivityLog(auditLog);

      if (!isDraft && isOnline) {
        triggerSyncNow();
      }

      onNavigate('my-reports');
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save report to local storage.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories: { key: ReportCategory; label: string; desc: string }[] = [
    { key: 'water_infrastructure', label: 'Water Infrastructure', desc: 'Boreholes, pumps, pipe bursts, valves' },
    { key: 'equipment_damage', label: 'Equipment Damage', desc: 'Transformers, generators, switchgear' },
    { key: 'service_interruption', label: 'Service Interruption', desc: 'Outages, low pressure, broken connections' },
    { key: 'safety_concern', label: 'Safety Concern', desc: 'Open manholes, live wires, chemical leaks' },
    { key: 'maintenance', label: 'Maintenance Needed', desc: 'Desilting, valve greasing, preventative repair' },
    { key: 'other', label: 'Other Infrastructure', desc: 'Road washouts, culverts, building assets' },
  ];

  const priorities: { key: ReportPriority; label: string }[] = [
    { key: 'low', label: 'Low' },
    { key: 'medium', label: 'Medium' },
    { key: 'high', label: 'High' },
    { key: 'critical', label: 'Critical' },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6 pb-28 md:pb-16">
      <button
        onClick={() => onNavigate('worker-dashboard')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Dashboard</span>
      </button>

      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
          {editDraftId ? 'Edit Local Issue Draft' : 'Report Infrastructure Problem'}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Complete report details. Offline-safe: data is preserved in IndexedDB even if network is lost.
        </p>
      </div>

      {saveError && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="space-y-6 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
            Issue Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Ruptured 90mm Feeder Pipe Flooding Access Road"
            className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {formErrors.title && <p className="text-xs text-rose-500 mt-1">{formErrors.title}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-2">
            Infrastructure Category *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {categories.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={`p-3 text-left rounded-xl border transition-all ${
                  category === c.key
                    ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 text-slate-900 dark:text-white ring-1 ring-amber-500'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{c.label}</span>
                  {category === c.key && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{c.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-2">
            Severity / Priority Level *
          </label>
          <div className="grid grid-cols-4 gap-2">
            {priorities.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPriority(p.key)}
                className={`py-2 text-center text-xs font-bold rounded-lg border transition-all ${
                  priority === p.key
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
            Location & Coordinates *
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="Landmark name (e.g. Sector 4 Borehole, Junction Market Road)"
                className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <button
              type="button"
              onClick={detectLocation}
              disabled={isLocating}
              className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <Crosshair className={`w-4 h-4 ${isLocating ? 'animate-spin text-amber-500' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">{isLocating ? 'Acquiring GPS...' : 'Auto GPS'}</span>
            </button>
          </div>
          {formErrors.locationName && <p className="text-xs text-rose-500">{formErrors.locationName}</p>}
          {gpsStatusMsg && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">{gpsStatusMsg}</p>
          )}

          {latitude !== null && longitude !== null && (
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-[11px] font-mono text-slate-600 dark:text-slate-400 flex items-center justify-between gap-2">
              <span>
                Coordinates: <strong className="text-slate-900 dark:text-white">{latitude}, {longitude}</strong>
              </span>
              <div className="flex items-center gap-3">
                <span>Accuracy: ±{accuracy || 4.0}m</span>
                <button
                  type="button"
                  onClick={() => {
                    setLatitude(null);
                    setLongitude(null);
                    setAccuracy(null);
                  }}
                  className="text-rose-500 hover:underline font-sans font-semibold"
                >
                  Clear GPS
                </button>
              </div>
            </div>
          )}

          {latitude !== null && longitude !== null && (
            <div className="pt-1">
              <GeoMapCard
                latitude={latitude}
                longitude={longitude}
                locationName={locationName || 'Acquired GPS Location'}
                accuracyMeters={accuracy}
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-2">
            Site Photo Attachment
          </label>

          {photoPreview ? (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-w-sm">
              <img
                src={photoPreview}
                alt="Infrastructure problem site preview"
                className="w-full h-48 object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  setPhotoPreview(null);
                  setPhotoBlob(null);
                }}
                className="absolute top-2 right-2 p-1 rounded-full bg-slate-950/80 text-white hover:bg-rose-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-amber-500 dark:hover:border-amber-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-800/20"
            >
              <Camera className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Snap photo with camera or upload image
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Compressed automatically &amp; saved offline in IndexedDB
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoUpload}
            className="hidden"
          />
        </div>

        <AudioMemoRecorder
          audioUrl={audioMemo}
          onAudioChange={setAudioMemo}
        />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
              Issue Description *
            </label>
            <span className="text-[11px] font-mono text-slate-400">
              {description.length} chars
            </span>
          </div>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe specific symptoms, equipment serials, impact on water/power delivery, safety threats, and required materials..."
            className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {formErrors.description && <p className="text-xs text-rose-500 mt-1">{formErrors.description}</p>}
        </div>

        <div className="pt-2 text-[11px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
          <span>UUID v4 Key: {clientId}</span>
          <span>{isOnline ? 'Network: Online' : 'Network: Offline (Queued)'}</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={isSubmitting}
          className="w-full sm:flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>Save Local Draft Only</span>
        </button>

        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={isSubmitting}
          className="w-full sm:flex-2 py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2 shadow-md shadow-amber-500/10 transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          <span>{isOnline ? 'Submit & Synchronize Issue' : 'Save Offline in Sync Queue'}</span>
        </button>
      </div>
    </div>
  );
};
