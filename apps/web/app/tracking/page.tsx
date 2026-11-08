'use client';

import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api-config';

interface TimelineStep {
  stepStatus: string;
  title: string;
  description: string;
  state: 'COMPLETED' | 'CURRENT' | 'PENDING' | 'CANCELLED';
  completedAt: string | null;
}

interface PublicTrackingData {
  orderNumber: string;
  currentStatus: string;
  statusDescription: string;
  progressPercentage: number;
  steps: TimelineStep[];
  installationSla: {
    calculatedSlaDays: number;
    estimatedActiveDate: string;
    isGuaranteed: boolean;
    slaStartTimestamp: string;
    remainingDays: number;
    disclaimer: string;
  };
  maskedCustomer: {
    companyTradeName: string;
    contactName: string;
    contactPhone: string;
    city: string;
    state: string;
    installationAddress: string;
  };
  items: Array<{
    productName: string;
    category: string;
    quantity: number;
  }>;
  recentEvents: Array<{
    eventName: string;
    description: string;
    timestamp: string;
  }>;
}

export default function TrackingPage() {
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [trackingData, setTrackingData] = useState<PublicTrackingData | null>(null);

  // Operations Simulator State
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simRole, setSimRole] = useState('OPERATIONS');
  const [simNextStatus, setSimNextStatus] = useState('FEASIBILITY_CLEARED');
  const [simTechName, setSimTechName] = useState('Rajesh Sharma');
  const [simTechPhone, setSimTechPhone] = useState('+91 9822334455');
  const [simNotes, setSimNotes] = useState('Fiber exchange route survey cleared and verified.');
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Auto-fetch if token query param is in URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        setTokenInput(urlToken);
        fetchTracking(urlToken);
      }
    }
  }, []);

  const fetchTracking = async (token: string) => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/tracking/${encodeURIComponent(token.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || `Tracking lookup failed (${res.status})`);
      }

      setTrackingData(data);
      // Update simulator next status based on current
      updateSuggestedSimStatus(data.currentStatus);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to locate order. Please check the secret tracking token.');
      setTrackingData(null);
    } finally {
      setLoading(false);
    }
  };

  const updateSuggestedSimStatus = (current: string) => {
    if (current === 'ORDER_RECEIVED') setSimNextStatus('KYC_VALIDATED');
    else if (current === 'KYC_VALIDATED') setSimNextStatus('FEASIBILITY_CLEARED');
    else if (current === 'FEASIBILITY_CLEARED') setSimNextStatus('TECHNICIAN_DISPATCHED');
    else if (current === 'TECHNICIAN_DISPATCHED') setSimNextStatus('INSTALLED_AND_ACTIVE');
  };

  const handleSimulateTransition = async () => {
    if (!trackingData) return;
    setSimLoading(true);
    setSimError(null);

    try {
      // Authenticate server-side as selected demo role to obtain verified JWT
      let authHeader = '';
      if (simRole !== 'UNAUTHORIZED_USER') {
        let email = 'ops@accel.telecom';
        let password = 'Accel@2026!Operations';
        if (simRole === 'TECHNICIAN') {
          email = 'tech@accel.telecom';
          password = 'Accel@2026!Technician';
        } else if (simRole === 'ADMIN') {
          email = 'admin@accel.telecom';
          password = 'Accel@2026!Admin';
        }

        const loginRes = await fetch(`${API_BASE_URL}/api/auth/staff/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const loginData = await loginRes.json();
        if (loginData.accessToken) {
          authHeader = `Bearer ${loginData.accessToken}`;
        }
      }

      const res = await fetch(`${API_BASE_URL}/api/orders/${trackingData.orderNumber}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {})
        },
        body: JSON.stringify({
          toStatus: simNextStatus,
          reason: `Advanced during evaluation demo by ${simRole}`,
          assignedTechnician: simNextStatus === 'TECHNICIAN_DISPATCHED' ? simTechName : undefined,
          technicianPhone: simNextStatus === 'TECHNICIAN_DISPATCHED' ? simTechPhone : undefined,
          notes: simNotes
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.message || 'Transition rejected');
      }

      // Re-fetch tracking using current token
      await fetchTracking(tokenInput);
    } catch (err: any) {
      setSimError(err.message);
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-red-600 uppercase tracking-wider">
          <span>Phase 5</span>
          <span>•</span>
          <span>Public Fulfillment Tracker</span>
        </div>
        <h1 className="mt-1 text-3xl font-extrabold text-slate-900 tracking-tight">
          Secure Public Order Tracking
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Token-gated, cryptographic zero-PII tracking for MSME telecom orders. Real-time engineering SLA estimate, field technician updates, and state transition auditing.
        </p>
      </div>

      {/* Token Search Bar */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
          Enter Cryptographic Tracking Secret
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="e.g. TRK-2026-s8rX92K..."
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            className="flex-1 px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none font-mono"
          />
          <button
            onClick={() => fetchTracking(tokenInput)}
            disabled={loading || !tokenInput}
            className={`px-8 py-3 rounded-xl font-bold text-sm text-white transition-all shadow ${
              loading || !tokenInput
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 active:scale-[0.98]'
            }`}
          >
            {loading ? 'Validating Token...' : 'Track Order'}
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          🔒 Public tracking is rate-limited to 30 requests/minute and strictly strips all internal database UUIDs and raw tracking hashes.
        </p>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <div className="font-bold">Lookup Unsuccessful</div>
            <div className="text-xs mt-0.5">{errorMsg}</div>
          </div>
        </div>
      )}

      {/* Tracking Results View */}
      {trackingData && (
        <div className="space-y-6">
          {/* Main Status & Progress Header */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-slate-500">Order Reference</span>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                  {trackingData.orderNumber}
                </h2>
              </div>
              <div>
                <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                  trackingData.currentStatus === 'INSTALLED_AND_ACTIVE'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : trackingData.currentStatus === 'CANCELLED'
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {trackingData.currentStatus.replace(/_/g, ' ')}
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Fulfillment Progress</span>
                <span className="text-red-600">{trackingData.progressPercentage}%</span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-600 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${trackingData.progressPercentage}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-600 pt-1">
                {trackingData.statusDescription}
              </p>
            </div>
          </div>

          {/* SLA & Non-Guaranteed Disclaimer Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 rounded-2xl shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-red-400 uppercase tracking-widest">
                Deployment SLA Schedule
              </span>
              <span className="text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/40 px-2 py-0.5 rounded">
                Non-Guaranteed Estimate
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div>
                <div className="text-xs text-slate-400">Calculated SLA Window</div>
                <div className="text-2xl font-bold text-white mt-1">
                  {trackingData.installationSla.calculatedSlaDays} Days
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Target Activation Date</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">
                  {trackingData.installationSla.estimatedActiveDate}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Countdown</div>
                <div className="text-xl font-bold text-amber-300 mt-1">
                  {trackingData.installationSla.remainingDays} Days Left
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-300 bg-slate-800/80 p-3 rounded-xl border border-slate-700/60 leading-relaxed flex items-start gap-2">
              <span className="text-amber-400 text-base leading-none">ℹ</span>
              <span>{trackingData.installationSla.disclaimer}</span>
            </div>
          </div>

          {/* Visual 5-Stage Stepper */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-slate-500">
              5-Stage Deployment Milestones
            </h3>

            <div className="space-y-6 relative before:absolute before:inset-0 before:left-4 before:h-full before:w-0.5 before:bg-slate-200">
              {trackingData.steps.map((step, idx) => {
                const isCompleted = step.state === 'COMPLETED';
                const isCurrent = step.state === 'CURRENT';

                return (
                  <div key={step.stepStatus} className="relative flex items-start gap-4 pl-2">
                    {/* Step Icon */}
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10 ${
                        isCompleted
                          ? 'bg-emerald-600 text-white shadow-md'
                          : isCurrent
                          ? 'bg-red-600 text-white ring-4 ring-red-100 shadow-md animate-pulse'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isCompleted ? '✓' : idx + 1}
                    </div>

                    {/* Step Content */}
                    <div className="flex-1 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className={`text-sm font-bold ${isCurrent ? 'text-red-700' : 'text-slate-900'}`}>
                          {step.title}
                        </span>
                        {step.completedAt && (
                          <span className="text-[11px] font-mono text-slate-500">
                            Completed: {new Date(step.completedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Zero-PII Customer & Location Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Masked Subscriber Info
                </h4>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Zero PII Leakage
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-xs text-slate-400 block">Enterprise Trade Name</span>
                  <span className="font-semibold text-slate-900">
                    {trackingData.maskedCustomer.companyTradeName}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Authorized Contact</span>
                  <span className="font-mono text-slate-700">
                    {trackingData.maskedCustomer.contactName}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Contact Phone</span>
                  <span className="font-mono text-slate-700">
                    {trackingData.maskedCustomer.contactPhone}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Installation Facility
                </h4>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  Verified Site
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-xs text-slate-400 block">Masked Address</span>
                  <span className="font-mono text-slate-700">
                    {trackingData.maskedCustomer.installationAddress}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-xs text-slate-400 block">City</span>
                    <span className="font-semibold text-slate-900">{trackingData.maskedCustomer.city}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">State</span>
                    <span className="font-semibold text-slate-900">{trackingData.maskedCustomer.state}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Products in Fulfillment */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Enrolled Telecom Services ({trackingData.items.length})
            </h4>
            <div className="divide-y divide-slate-100">
              {trackingData.items.map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-semibold text-slate-900">{item.productName}</span>
                    <span className="ml-2 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-mono">
                      {item.category}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-slate-700">Qty: {item.quantity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Operational State Transition Simulator (Evaluator Showcase) */}
          <div className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-300 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Operations & State Machine Simulator
                </h4>
                <p className="text-xs text-slate-500">
                  Demonstrate server-authorized order state progression for hackathon evaluators.
                </p>
              </div>
              <button
                onClick={() => setSimulatorOpen(!simulatorOpen)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors"
              >
                {simulatorOpen ? 'Hide Simulator ▲' : 'Open Simulator ▼'}
              </button>
            </div>

            {simulatorOpen && (
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4 mt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Staff Role Header</label>
                    <select
                      value={simRole}
                      onChange={(e) => setSimRole(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    >
                      <option value="OPERATIONS">OPERATIONS</option>
                      <option value="TECHNICIAN">TECHNICIAN</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="UNAUTHORIZED_USER">UNAUTHORIZED (Test 403)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Target Next Status</label>
                    <select
                      value={simNextStatus}
                      onChange={(e) => setSimNextStatus(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    >
                      <option value="KYC_VALIDATED">KYC_VALIDATED</option>
                      <option value="FEASIBILITY_CLEARED">FEASIBILITY_CLEARED</option>
                      <option value="TECHNICIAN_DISPATCHED">TECHNICIAN_DISPATCHED</option>
                      <option value="INSTALLED_AND_ACTIVE">INSTALLED_AND_ACTIVE</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                  </div>
                </div>

                {simNextStatus === 'TECHNICIAN_DISPATCHED' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-medium text-slate-600 mb-1">Technician Name</label>
                      <input
                        type="text"
                        value={simTechName}
                        onChange={(e) => setSimTechName(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-600 mb-1">Technician Phone</label>
                      <input
                        type="text"
                        value={simTechPhone}
                        onChange={(e) => setSimTechPhone(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {simError && (
                  <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                    <strong>Error:</strong> {simError}
                  </div>
                )}

                <button
                  onClick={handleSimulateTransition}
                  disabled={simLoading}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors shadow"
                >
                  {simLoading ? 'Transitioning State...' : `Advance State to ${simNextStatus}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
