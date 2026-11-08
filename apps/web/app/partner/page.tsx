'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api-config';

interface PartnerMetrics {
  totalAssigned?: number;
  totalAssignedLeads?: number;
  contacted?: number;
  contactedLeads?: number;
  recovered?: number;
  recoveredLeads?: number;
  recoveryRatePercent: number;
  estimatedCommissionInr: number;
  highPriorityCount: number;
}

interface DroppedLeadItem {
  id: string;
  businessId: string;
  companyTradeName: string;
  segment: string;
  city: string;
  state: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  stageAtDrop: string;
  dropReason: string;
  status: string;
  propensityScore: number;
  propensityPriority: 'HIGH' | 'MEDIUM' | 'LOW';
  assignedPartnerId: string | null;
  assignedAt: string | null;
  lastContactedAt: string | null;
  activityCount: number;
}

export default function PartnerDashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<PartnerMetrics | null>(null);
  const [leads, setLeads] = useState<DroppedLeadItem[]>([]);

  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Admin Assignment Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [unassignedLeadId, setUnassignedLeadId] = useState('');
  const [targetPartnerId, setTargetPartnerId] = useState('PTN-VIZAG-01');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('udyamone_token');
    const storedUser = localStorage.getItem('udyamone_user');

    if (!storedToken || !storedUser) {
      router.push('/partner/login');
      return;
    }

    setToken(storedToken);
    try {
      setUser(JSON.parse(storedUser));
    } catch {
      setUser(null);
    }

    loadDashboardData(storedToken);
  }, [router]);

  const loadDashboardData = async (authToken: string) => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const headers = {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      };

      // Fetch partner metrics and leads in parallel
      const [metricsRes, leadsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/partner/metrics`, { headers }),
        fetch(`${API_BASE_URL}/api/partner/leads?limit=100`, { headers })
      ]);

      if (metricsRes.status === 401 || leadsRes.status === 401) {
        localStorage.removeItem('udyamone_token');
        localStorage.removeItem('udyamone_user');
        router.push('/partner/login');
        return;
      }

      if (!metricsRes.ok) {
        throw new Error(`Failed to load metrics (${metricsRes.status})`);
      }
      if (!leadsRes.ok) {
        throw new Error(`Failed to load assigned leads (${leadsRes.status})`);
      }

      const metricsData = await metricsRes.json();
      const leadsData = await leadsRes.json();

      setMetrics(metricsData);
      const rawList = Array.isArray(leadsData) ? leadsData : (leadsData.leads || []);
      const mappedList: DroppedLeadItem[] = rawList.map((l: any) => ({
        id: l.id,
        businessId: l.businessId || l.id,
        companyTradeName: l.companyTradeName || l.businessName || 'Business Owner',
        segment: l.segment || 'MICRO_RETAIL',
        city: l.city || '',
        state: l.state || '',
        contactName: l.contactName || 'Business Signatory',
        contactPhone: l.contactPhone || '9876543210',
        contactEmail: l.contactEmail || 'contact@msme.in',
        stageAtDrop: l.stageAtDrop || l.stageReached || 'Contacted',
        dropReason: l.dropReason || 'Unspecified',
        status: l.status || 'ASSIGNED',
        propensityScore: Number(l.propensityScore) || 0,
        propensityPriority: (l.propensityPriority || l.propensityRank || 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW',
        assignedPartnerId: l.assignedPartnerId,
        assignedAt: l.createdAt,
        lastContactedAt: null,
        activityCount: l.activities?.length || 0
      }));
      setLeads(mappedList);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error communicating with backend API.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('udyamone_token');
    localStorage.removeItem('udyamone_user');
    router.push('/partner/login');
  };

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Priority filter
      if (priorityFilter !== 'ALL' && lead.propensityPriority !== priorityFilter) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'ALL' && lead.status !== statusFilter) {
        return false;
      }
      // Search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = lead.companyTradeName?.toLowerCase().includes(query);
        const matchesCity = lead.city?.toLowerCase().includes(query);
        const matchesContact = lead.contactName?.toLowerCase().includes(query);
        const matchesReason = lead.dropReason?.toLowerCase().includes(query);
        return matchesName || matchesCity || matchesContact || matchesReason;
      }
      return true;
    });
  }, [leads, priorityFilter, statusFilter, searchTerm]);

  // Admin Lead Assignment Handler
  const handleAssignLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unassignedLeadId || !token) return;

    setAssignLoading(true);
    setAssignSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/partner/leads/${encodeURIComponent(unassignedLeadId.trim())}/assign`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ partnerId: targetPartnerId })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Assignment failed');
      }
      setAssignSuccess(`Lead successfully assigned to ${targetPartnerId}`);
      setUnassignedLeadId('');
      // Reload dashboard data
      loadDashboardData(token);
    } catch (err: any) {
      alert(`Assignment error: ${err.message}`);
    } finally {
      setAssignLoading(false);
    }
  };

  const getPriorityBadge = (priority: string, score: number) => {
    if (priority === 'HIGH') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
          Score: {score} • HIGH PRIORITY
        </span>
      );
    }
    if (priority === 'MEDIUM') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
          Score: {score} • MEDIUM
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
        Score: {score} • LOW
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RECOVERED':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-600 text-white">RECOVERED</span>;
      case 'IN_FOLLOW_UP':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">IN FOLLOW-UP</span>;
      case 'CONTACTED':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">CONTACTED</span>;
      case 'ASSIGNED':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">ASSIGNED (NEW)</span>;
      case 'CLOSED_LOST':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-700">CLOSED LOST</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Partner Agency Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded border border-red-200 uppercase">
              Partner Workspace
            </span>
            {user?.role === 'ADMIN' ? (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded border border-purple-200 uppercase">
                Enterprise Admin
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded border border-blue-200 uppercase">
                Agency ID: {user?.partnerId || 'Unassigned'}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {user?.role === 'ADMIN' ? 'National Lead Recovery Operations' : 'Channel Partner Lead Recovery Hub'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Logged in as <span className="font-semibold text-slate-800">{user?.name}</span> ({user?.email}) • Multi-Tenant Isolated Workspace
          </p>
        </div>

        <div className="flex items-center gap-3">
          {user?.role === 'ADMIN' && (
            <button
              onClick={() => setShowAssignModal(!showAssignModal)}
              className="px-3.5 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-sm transition"
            >
              + Assign Lead to Partner
            </button>
          )}
          <Link
            href="/analytics"
            className="px-3.5 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
          >
            Executive Analytics →
          </Link>
          <button
            onClick={handleLogout}
            className="px-3.5 py-2 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Admin Quick Assignment Drawer (Visible only to ADMIN) */}
      {showAssignModal && user?.role === 'ADMIN' && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-purple-900">Admin Lead Assignment Console</h3>
            <button
              onClick={() => setShowAssignModal(false)}
              className="text-purple-700 hover:text-purple-900 text-xs font-bold"
            >
              Close ✕
            </button>
          </div>
          <form onSubmit={handleAssignLead} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-purple-800 uppercase mb-1">
                Lead ID or Business ID
              </label>
              <input
                type="text"
                placeholder="e.g. SMB-0004 or BIZ-..."
                value={unassignedLeadId}
                onChange={(e) => setUnassignedLeadId(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs border border-purple-300 rounded bg-white text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-purple-800 uppercase mb-1">
                Target Channel Partner
              </label>
              <select
                value={targetPartnerId}
                onChange={(e) => setTargetPartnerId(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-purple-300 rounded bg-white text-slate-900"
              >
                <option value="PTN-VIZAG-01">Vizag Fiber Connect (PTN-VIZAG-01)</option>
                <option value="PTN-NAGPUR-01">Nagpur Enterprise Solutions (PTN-NAGPUR-01)</option>
                <option value="PTN-DELHI-01">Capital Business Networks (PTN-DELHI-01)</option>
              </select>
            </div>
            <div>
              <button
                type="submit"
                disabled={assignLoading}
                className="w-full py-1.5 px-4 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded transition disabled:opacity-50"
              >
                {assignLoading ? 'Assigning...' : 'Dispatch Lead Assignment'}
              </button>
            </div>
          </form>
          {assignSuccess && (
            <p className="mt-2 text-xs font-semibold text-emerald-700">✓ {assignSuccess}</p>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Assigned Leads</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{metrics?.totalAssignedLeads ?? metrics?.totalAssigned ?? '—'}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Active portfolio</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase">High Priority</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{metrics?.highPriorityCount ?? '—'}</p>
          <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">Score ≥ 70</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Contacted</p>
          <p className="text-2xl font-black text-blue-600 mt-1">{metrics?.contactedLeads ?? metrics?.contacted ?? '—'}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Outreach initiated</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Recovered</p>
          <p className="text-2xl font-black text-purple-600 mt-1">{metrics?.recoveredLeads ?? metrics?.recovered ?? '—'}</p>
          <p className="text-[10px] text-purple-600 font-semibold mt-0.5">Orders activated</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Recovery Rate</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{metrics?.recoveryRatePercent ?? 0}%</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Conversion efficacy</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Est. Commission</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">₹{(metrics?.estimatedCommissionInr ?? 0).toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">₹2,500 / active order</p>
        </div>
      </div>

      {/* Main Workspace: Filter & Lead Pipeline */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
        {/* Filter Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          {/* Priority Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setPriorityFilter('ALL')}
              className={`px-3 py-1.5 rounded-md transition ${priorityFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              All Leads ({leads.length})
            </button>
            <button
              onClick={() => setPriorityFilter('HIGH')}
              className={`px-3 py-1.5 rounded-md transition ${priorityFilter === 'HIGH' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              High Priority (≥70)
            </button>
            <button
              onClick={() => setPriorityFilter('MEDIUM')}
              className={`px-3 py-1.5 rounded-md transition ${priorityFilter === 'MEDIUM' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Medium Priority (45-69)
            </button>
            <button
              onClick={() => setPriorityFilter('LOW')}
              className={`px-3 py-1.5 rounded-md transition ${priorityFilter === 'LOW' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Low Priority
            </button>
          </div>

          {/* Search & Status Filter */}
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
            >
              <option value="ALL">All Statuses</option>
              <option value="ASSIGNED">Assigned (New)</option>
              <option value="CONTACTED">Contacted</option>
              <option value="IN_FOLLOW_UP">In Follow-up</option>
              <option value="RECOVERED">Recovered</option>
              <option value="CLOSED_LOST">Closed Lost</option>
            </select>

            <input
              type="text"
              placeholder="Search business, city, contact..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 w-60 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />
          </div>
        </div>

        {/* Lead Table / Cards */}
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            <svg className="animate-spin h-6 w-6 text-red-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading assigned leads from secure partner database...
          </div>
        ) : errorMsg ? (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <span className="font-bold">Error:</span> {errorMsg}
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            No leads match your selected filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3">MSME Business / Trade Name</th>
                  <th className="py-3 px-3">Location</th>
                  <th className="py-3 px-3">Propensity Score</th>
                  <th className="py-3 px-3">Drop Stage & Reason</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Business Name */}
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{lead.companyTradeName}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium text-[10px]">
                          {lead.segment}
                        </span>
                        <span>•</span>
                        <span>{lead.contactName} ({lead.contactPhone})</span>
                      </div>
                    </td>

                    {/* Location */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">{lead.city}</span>
                      <div className="text-[11px] text-slate-400">{lead.state}</div>
                    </td>

                    {/* Propensity Score */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getPriorityBadge(lead.propensityPriority, lead.propensityScore)}
                    </td>

                    {/* Drop Stage & Reason */}
                    <td className="py-3 px-3 max-w-xs">
                      <div className="font-medium text-slate-800 flex items-center gap-1.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          {lead.stageAtDrop}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate" title={lead.dropReason}>
                        {lead.dropReason}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getStatusBadge(lead.status)}
                      {lead.activityCount > 0 && (
                        <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
                          {lead.activityCount} follow-up{lead.activityCount > 1 ? 's' : ''}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <Link
                        href={`/partner/leads/${lead.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm transition"
                      >
                        Recover Lead →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
