import React, { useState } from 'react';
import { HardHat, Shield, Lock, Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LoginPageProps {
  onNavigate: (page: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login, isDemoMode, isConfigError, authError, clearAuthError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const displayedError = error || authError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearAuthError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid work email address.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(trimmedEmail, password);
      if (!result.success || !result.user) {
        setError(result.error || 'Unable to sign in. Please verify your credentials.');
        return;
      }

      if (result.user.role === 'coordinator') {
        onNavigate('coord-dashboard');
      } else {
        onNavigate('worker-dashboard');
      }
    } catch {
      setError('Unable to sign in. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickLoginWorker = async () => {
    const result = await login('samuel.kiprop@fieldops.org', 'demo-preview', 'field_worker');
    if (result.success) {
      onNavigate('worker-dashboard');
    }
  };

  const handleQuickLoginCoordinator = async () => {
    const result = await login('elena.morales@dispatch.org', 'demo-preview', 'coordinator');
    if (result.success) {
      onNavigate('coord-dashboard');
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center mx-auto shadow-md">
            <HardHat className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Sign In to FieldTrack
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Secure offline-first reporting system with role-based access control.
          </p>
        </div>

        {/* Quick demo shortcuts are shown ONLY in genuine unconfigured demo mode */}
        {isDemoMode && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2.5">
            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider text-center">
              Demo Preview 1-Click Access
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleQuickLoginWorker}
                className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <HardHat className="w-4 h-4" />
                <span>Field Worker</span>
              </button>
              <button
                type="button"
                onClick={handleQuickLoginCoordinator}
                className="p-2.5 rounded-xl bg-slate-900 text-white dark:bg-slate-800 hover:bg-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Shield className="w-4 h-4" />
                <span>Coordinator</span>
              </button>
            </div>
          </div>
        )}

        {/* Standard Login Form */}
        <form onSubmit={handleSubmit} noValidate className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          {displayedError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{displayedError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="worker@fieldops.org"
                autoComplete="email"
                className="w-full pl-9 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                autoComplete="current-password"
                className="w-full pl-9 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isConfigError}
            className="w-full py-3 px-4 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-950 font-bold text-xs hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Signing In...' : 'Sign In with Email'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500">
          Need a field worker account?{' '}
          <button
            onClick={() => onNavigate('register')}
            className="font-bold text-amber-600 dark:text-amber-400 hover:underline"
          >
            Register as Field Worker
          </button>
        </p>
      </div>
    </div>
  );
};
