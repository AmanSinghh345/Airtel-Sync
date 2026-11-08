'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api-config';

interface ScoringFactor {
  factor: string;
  points: number;
  maxPoints: number;
  description: string;
}

interface ActivityItem {
  id: string;
  activityType: string;
  outcome: string;
  notes: string | null;
  nextFollowUpDate: string | null;
  performedBy: string;
  performedByRole: string;
  createdAt: string;
}

interface LeadDetail {
  id: string;
  businessId: string;
  companyTradeName: string;
  companyLegalName: string;
  segment: string;
  city: string;
  state: string;
  cityTier: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  contactDesignation: string | null;
  employeeCount: number;
  sitesCount: number;
  estimatedMonthlySpendInr: number;
  hasGstin: boolean;
  gstinVerified: boolean;
  hasUdyam: boolean;
  udyamVerified: boolean;
  stageAtDrop: string;
  dropReason: string;
  status: string;
  assignedPartnerId: string | null;
  assignedAt: string | null;
  recoveryOrderId: string | null;
  propensityScore: number;
  propensityPriority: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityReason?: string;
  recommendedAction?: string;
  scoringFactors: ScoringFactor[];
  recoveryPitch: string;
  activities: ActivityItem[];
}

export default function LeadRecoveryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params?.id as string;

  const [token, setToken] = useState<string | null>(null);
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State: Activity Logger
  const [activityType, setActivityType] = useState('PHONE_CALL');
  const [outcome, setOutcome] = useState('CONNECTED_INTERESTED');
  const [notes, setNotes] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [activitySubmitting, setActivitySubmitting] = useState(false);
  const [activitySuccess, setActivitySuccess] = useState<string | null>(null);

  // Form State: Status Transition
  const [selectedStatus, setSelectedStatus] = useState('');
  const [recoveryOrderId, setRecoveryOrderId] = useState('');
  const [closedReason, setClosedReason] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('udyamone_token');
    if (!storedToken) {
      router.push('/partner/login');
      return;
    }
    setToken(storedToken);
    loadLeadDetails(storedToken, leadId);
  }, [router, leadId]);

  const loadLeadDetails = async (authToken: string, id: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/partner/leads/${encodeURIComponent(id)}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.status === 401) {
        localStorage.removeItem('udyamone_token');
        router.push('/partner/login');
        return;
      }
      if (res.status === 403) {
        throw new Error('Access Forbidden: This lead is assigned to another channel partner agency.');
      }
      if (!res.ok) {
        throw new Error(`Failed to load lead details (${res.status})`);
      }

      const data = await res.json();
      const mappedLead: LeadDetail = {
        id: data.id,
        businessId: data.businessId || data.id,
        companyTradeName: data.companyTradeName || data.businessName || 'Business Owner',
        companyLegalName: data.companyLegalName || data.businessName || 'Enterprise Account',
        segment: data.segment || 'MICRO_RETAIL',
        city: data.city || '',
        state: data.state || '',
        cityTier: data.cityTier ? `Tier ${data.cityTier}` : 'Tier 2',
        contactName: data.contactName || 'Business Signatory',
        contactPhone: data.contactPhone || '9876543210',
        contactEmail: data.contactEmail || 'contact@msme.in',
        contactDesignation: data.contactRole || 'Proprietor',
        employeeCount: data.employeeCount || 1,
        sitesCount: data.numSites || 1,
        estimatedMonthlySpendInr: Number(data.monthlySpendInr || data.monthlyTelecomSpendInr) || 0,
        hasGstin: Boolean(data.hasGstin),
        gstinVerified: Boolean(data.hasGstin),
        hasUdyam: Boolean(data.hasUdyam),
        udyamVerified: Boolean(data.hasUdyam),
        stageAtDrop: data.stageAtDrop || data.stageReached || 'Contacted',
        dropReason: data.dropReason || 'Unspecified',
        status: data.status,
        assignedPartnerId: data.assignedPartnerId,
        assignedAt: data.createdAt,
        recoveryOrderId: null,
        propensityScore: Number(data.propensityScore) || 0,
        propensityPriority: (data.propensityPriority || data.propensityRank || 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW',
        priorityReason: data.priorityReason,
        recommendedAction: data.recommendedAction,
        scoringFactors: (data.scoringFactors || []).map((f: any) => ({
          factor: f.factor,
          points: f.points,
          maxPoints: f.maxPoints || f.points,
          description: f.description
        })),
        recoveryPitch: data.recoveryPitch || '',
        activities: (data.activities || []).map((a: any) => ({
          id: a.id,
          activityType: a.activityType,
          outcome: a.outcome || '',
          notes: a.notes,
          nextFollowUpDate: a.followUpDate,
          performedBy: a.partnerName || 'Partner Representative',
          performedByRole: 'CHANNEL_PARTNER',
          createdAt: a.createdAt
        }))
      };
      setLead(mappedLead);
      setSelectedStatus(data.status);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error loading lead details');
    } finally {
      setLoading(false);
    }
  };

  const handleLogActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !lead) return;

    setActivitySubmitting(true);
    setActivitySuccess(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/partner/leads/${lead.id}/activity`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          activityType,
          outcome,
          notes: notes.trim() || undefined,
          nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate).toISOString() : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to record activity');
      }

      setActivitySuccess('Activity recorded successfully!');
      setNotes('');
      // Refresh lead details
      loadLeadDetails(token, lead.id);
    } catch (err: any) {
      alert(`Activity error: ${err.message}`);
    } finally {
      setActivitySubmitting(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !lead) return;

    setStatusSubmitting(true);
    setStatusSuccess(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/partner/leads/${lead.id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: selectedStatus,
          recoveryOrderId: selectedStatus === 'RECOVERED' && recoveryOrderId ? recoveryOrderId.trim() : undefined,
          closedReason: selectedStatus === 'CLOSED_LOST' && closedReason ? closedReason.trim() : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update status');
      }

      setStatusSuccess(`Lead status successfully updated to ${selectedStatus}!`);
      // Refresh lead details
      loadLeadDetails(token, lead.id);
    } catch (err: any) {
      alert(`Status update error: ${err.message}`);
    } finally {
      setStatusSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-500 text-sm">
        <svg className="animate-spin h-8 w-8 text-red-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Loading lead details and propensity scoring model...
      </div>
    );
  }

  if (errorMsg || !lead) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <h2 className="text-base font-bold text-red-800 mb-2">Access Error</h2>
          <p className="text-xs text-red-600 mb-4">{errorMsg || 'Lead not found.'}</p>
          <Link
            href="/partner"
            className="inline-block px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700"
          >
            ← Back to Partner Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Action Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/partner" className="text-red-600 font-bold hover:underline">
            ← Partner Leads
          </Link>
          <span>/</span>
          <span className="font-semibold text-slate-700">{lead.companyTradeName}</span>
          <span>({lead.businessId})</span>
        </div>

        <div className="flex items-center gap-2">
          {lead.status === 'RECOVERED' && (
            <span className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-black shadow-sm flex items-center gap-1.5">
              ✓ RECOVERED & ACTIVATED
            </span>
          )}
          <Link
            href={`/checkout?businessId=${encodeURIComponent(lead.businessId)}`}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold shadow-sm transition"
          >
            Launch Digital Onboarding →
          </Link>
        </div>
      </div>

      {/* Main Grid: Left Column Lead Profile, Center Score & Pitch, Right Action Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Lead Profile & Drop Diagnosis (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Company Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 rounded border border-slate-200 uppercase">
                  {lead.segment} MSME
                </span>
                <h1 className="text-lg font-black text-slate-900 mt-2">{lead.companyTradeName}</h1>
                <p className="text-xs text-slate-500">{lead.companyLegalName}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Location:</span>
                <span className="font-semibold text-slate-800">{lead.city}, {lead.state} ({lead.cityTier})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Primary Contact:</span>
                <span className="font-semibold text-slate-800">{lead.contactName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Phone:</span>
                <a href={`tel:${lead.contactPhone}`} className="font-mono font-bold text-red-600 hover:underline">
                  {lead.contactPhone}
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Email:</span>
                <span className="text-slate-800 font-mono text-[11px]">{lead.contactEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Scale / Sites:</span>
                <span className="font-semibold text-slate-800">{lead.employeeCount} Staff • {lead.sitesCount} Office{lead.sitesCount > 1 ? 's' : ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Est. Monthly Spend:</span>
                <span className="font-bold text-emerald-700">₹{lead.estimatedMonthlySpendInr.toLocaleString('en-IN')}/mo</span>
              </div>
            </div>

            {/* Formal Registry Badges */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Government Verification</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className={`p-2 rounded border ${lead.gstinVerified ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                  <div className="font-bold">GSTIN Registry</div>
                  <div>{lead.gstinVerified ? '✓ Verified Active' : 'Not Registered'}</div>
                </div>
                <div className={`p-2 rounded border ${lead.udyamVerified ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                  <div className="font-bold">Udyam Registry</div>
                  <div>{lead.udyamVerified ? '✓ Verified MSME' : 'Not Registered'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Drop Diagnosis Card */}
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Drop Diagnosis</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-amber-700 font-medium">Stage Reached Before Drop:</span>
                <div className="font-black text-amber-950 mt-0.5 text-sm">{lead.stageAtDrop}</div>
              </div>
              <div className="pt-2 border-t border-amber-200/60">
                <span className="text-amber-700 font-medium">Customer Reported Drop Reason:</span>
                <div className="font-semibold text-amber-900 mt-0.5 italic bg-white/80 p-2 rounded border border-amber-200">
                  "{lead.dropReason}"
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Center & Right Column (8 cols): Propensity, Pitch, Activity Logger, Timeline */}
        <div className="lg:col-span-8 space-y-6">
          {/* Propensity Score & Explainability Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Deterministic AI Propensity Engine</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-3xl font-black text-slate-900">{lead.propensityScore}</span>
                  <span className="text-xs text-slate-400">/ 100</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                    lead.propensityPriority === 'HIGH' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                    lead.propensityPriority === 'MEDIUM' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                    'bg-slate-100 text-slate-700 border border-slate-300'
                  }`}>
                    {lead.propensityPriority} PRIORITY RECOVERY
                  </span>
                </div>
              </div>
              <div className="text-xs text-slate-500 max-w-xs text-right">
                Calculated deterministically from 5 weighted factors: Funnel progress, registry status, scale, and drop reason.
              </div>
            </div>

            {/* Factor breakdown */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {lead.scoringFactors.map((factor, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">{factor.factor}</span>
                    <span className="font-black text-emerald-600 font-mono">+{factor.points} / {factor.maxPoints} pts</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{factor.description}</p>
                </div>
              ))}
            </div>

            {/* Field Rep Pitch */}
            <div className="mt-4 p-4 bg-gradient-to-r from-red-50 to-orange-50 rounded-xl border border-red-200">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-red-800 uppercase tracking-wider">🎯 Contextual Recovery Pitch</span>
                <span className="text-[10px] bg-red-200 text-red-900 font-bold px-1.5 py-0.2 rounded">Field Rep Guide</span>
              </div>
              <p className="text-xs font-medium text-slate-800 leading-relaxed">
                {lead.recoveryPitch}
              </p>
            </div>

            {/* Operational Action & Priority Justification */}
            <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2.5">
              <div>
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">Classification Justification</span>
                <p className="text-slate-800 font-medium mt-0.5">{lead.priorityReason || `Classified as ${lead.propensityPriority} priority based on deterministic scoring threshold.`}</p>
              </div>
              <div className="pt-2 border-t border-slate-200/60">
                <span className="font-bold text-emerald-800 uppercase tracking-wider text-[10px] block">Recommended Operational Action</span>
                <p className="text-emerald-900 font-bold mt-0.5">{lead.recommendedAction || 'Execute partner outreach based on contextual guidance.'}</p>
              </div>
            </div>
          </div>

          {/* Action Hub: Status Transition & Log Activity */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Status Transition (5 cols) */}
            <div className="md:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Update Recovery Status</h3>
              {statusSuccess && (
                <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded font-medium">
                  {statusSuccess}
                </div>
              )}
              <form onSubmit={handleUpdateStatus} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Current Lifecycle Status</label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-900"
                  >
                    <option value="ASSIGNED">ASSIGNED (New)</option>
                    <option value="CONTACTED">CONTACTED</option>
                    <option value="IN_FOLLOW_UP">IN_FOLLOW_UP</option>
                    <option value="RECOVERED">RECOVERED (Customer Converted)</option>
                    <option value="CLOSED_LOST">CLOSED_LOST</option>
                  </select>
                </div>

                {selectedStatus === 'RECOVERED' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Recovery Order # (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. ORD-2026-..."
                      value={recoveryOrderId}
                      onChange={(e) => setRecoveryOrderId(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                )}

                {selectedStatus === 'CLOSED_LOST' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Loss Reason</label>
                    <input
                      type="text"
                      placeholder="e.g. Chose competitor, Business ceased..."
                      value={closedReason}
                      onChange={(e) => setClosedReason(e.target.value)}
                      required
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={statusSubmitting}
                  className="w-full py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {statusSubmitting ? 'Updating...' : 'Save Lifecycle Status'}
                </button>
              </form>
            </div>

            {/* Activity Logger Form (7 cols) */}
            <div className="md:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Record Follow-up Activity</h3>
              {activitySuccess && (
                <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded font-medium">
                  {activitySuccess}
                </div>
              )}
              <form onSubmit={handleLogActivity} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Channel / Type</label>
                    <select
                      value={activityType}
                      onChange={(e) => setActivityType(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900"
                    >
                      <option value="PHONE_CALL">📞 Phone Call</option>
                      <option value="IN_PERSON_VISIT">🏢 In-Person Visit</option>
                      <option value="WHATSAPP_MESSAGE">💬 WhatsApp</option>
                      <option value="EMAIL">✉️ Email</option>
                      <option value="NOTE">📝 Internal Note</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Interaction Outcome</label>
                    <select
                      value={outcome}
                      onChange={(e) => setOutcome(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900"
                    >
                      <option value="CONNECTED_INTERESTED">Connected & Interested</option>
                      <option value="CONNECTED_NOT_READY">Connected - Not Ready</option>
                      <option value="CALL_UNANSWERED">Call Unanswered</option>
                      <option value="VISIT_COMPLETED">Visit Completed</option>
                      <option value="FOLLOW_UP_SCHEDULED">Follow-Up Scheduled</option>
                      <option value="RECOVERY_AGREED">Recovery Agreed</option>
                      <option value="LOST_TO_COMPETITOR">Lost to Competitor</option>
                      <option value="NOT_INTERESTED">Not Interested</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Field Notes & Action Summary</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Discussed 500 Mbps fiber plan with Anita. Addressed 21-day delay concern by offering 7-day express installation guarantee..."
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Next Follow-Up Date</label>
                    <input
                      type="date"
                      value={nextFollowUpDate}
                      onChange={(e) => setNextFollowUpDate(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={activitySubmitting}
                    className="py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50"
                  >
                    {activitySubmitting ? 'Logging...' : 'Log Follow-up Activity'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Activity Timeline History */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">
              Engagement History & Audit Timeline ({lead.activities.length})
            </h3>

            {lead.activities.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                No follow-up interactions logged yet. Log the first outreach above to initiate recovery tracking.
              </p>
            ) : (
              <div className="space-y-4">
                {lead.activities.map((act) => (
                  <div key={act.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">
                          {act.activityType === 'IN_PERSON_VISIT' ? '🏢 In-Person Visit' :
                           act.activityType === 'PHONE_CALL' ? '📞 Phone Call' :
                           act.activityType === 'WHATSAPP_MESSAGE' ? '💬 WhatsApp' :
                           act.activityType === 'EMAIL' ? '✉️ Email' : '📝 Note'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-slate-200 text-slate-800">
                          {act.outcome}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(act.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {act.notes && (
                      <p className="mt-2 text-slate-700 text-xs leading-relaxed bg-white p-2.5 rounded border border-slate-100">
                        {act.notes}
                      </p>
                    )}
                    <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between">
                      <span>Logged by: <strong className="text-slate-600">{act.performedBy}</strong> ({act.performedByRole})</span>
                      {act.nextFollowUpDate && (
                        <span className="text-red-600 font-semibold">
                          Next Follow-Up: {new Date(act.nextFollowUpDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
