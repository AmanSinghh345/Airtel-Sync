'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api-config';

interface FunnelStageMetric {
  stage: string;
  leadCount: number;
  conversionPercentFromTotal: number;
  dropCount: number;
  dropRatePercent: number;
}

interface FunnelData {
  totalLeads: number;
  totalActivated: number;
  totalDropped: number;
  overallActivationRatePercent: number;
  overallDropRatePercent: number;
  funnelStages: FunnelStageMetric[];
}

interface DropReasonItem {
  reason: string;
  count: number;
  percentage: number;
  recoverableCategory: 'HIGH_RECOVERABILITY' | 'COMMERCIAL_NEGOTIATION' | 'UNRECOVERABLE';
}

interface SegmentItem {
  segment: string;
  totalLeads: number;
  activatedLeads: number;
  droppedLeads: number;
  conversionRatePercent: number;
}

interface PartnerItem {
  partnerId: string;
  partnerCode: string;
  agencyName: string;
  territoryCity: string;
  assignedLeads: number;
  activitiesLogged: number;
  recoveredLeads: number;
  recoveryRatePercent: number;
  estimatedRevenueInr: number;
  commissionEarnedInr: number;
}

interface RecoveryImpactData {
  highPriorityLeadsCount: number;
  mediumPriorityLeadsCount: number;
  recoveredCount: number;
  totalRecoveredRevenueInr: number;
  averageRecoveryDays: number;
}

export default function AnalyticsDashboardPage() {
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [dropReasons, setDropReasons] = useState<DropReasonItem[]>([]);
  const [segments, setSegments] = useState<SegmentItem[]>([]);
  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [impact, setImpact] = useState<RecoveryImpactData | null>(null);
  const [partnerAuthRequired, setPartnerAuthRequired] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  const loadAnalyticsData = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. Fetch public aggregated telemetry without authorization header
      const [funnelRes, dropRes, segRes, impRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/analytics/funnel`),
        fetch(`${API_BASE_URL}/api/analytics/drop-reasons`),
        fetch(`${API_BASE_URL}/api/analytics/segments`),
        fetch(`${API_BASE_URL}/api/analytics/recovery-impact`)
      ]);

      if (!funnelRes.ok || !dropRes.ok || !segRes.ok || !impRes.ok) {
        throw new Error('Public analytics endpoints failed to respond.');
      }

      const [fData, dData, sData, iData] = await Promise.all([
        funnelRes.json(),
        dropRes.json(),
        segRes.json(),
        impRes.json()
      ]);

      setFunnel(fData);
      setDropReasons(dData.dropReasons || []);
      setSegments(sData.segments || []);
      setImpact(iData);

      // 2. Fetch authenticated partner performance if token exists in client storage
      const token = typeof window !== 'undefined' ? localStorage.getItem('udyamone_token') : null;
      if (token) {
        const partRes = await fetch(`${API_BASE_URL}/api/analytics/partners`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (partRes.ok) {
          const pData = await partRes.json();
          setPartners(pData.partners || []);
          setPartnerAuthRequired(false);
        } else {
          setPartners([]);
          setPartnerAuthRequired(true);
        }
      } else {
        setPartners([]);
        setPartnerAuthRequired(true);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to connect to analytics services.');
    } finally {
      setLoading(false);
    }
  };

  const getRecoverabilityBadge = (rec: string) => {
    if (rec === 'HIGH_RECOVERABILITY') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          High Recoverability
        </span>
      );
    }
    if (rec === 'COMMERCIAL_NEGOTIATION') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
          Commercial Negotiation
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
        Unrecoverable
      </span>
    );
  };

  // Consolidated 7 root-cause clusters
  const CONSOLIDATED_7_CLUSTERS = [
    {
      cluster: '1. Unreachable / Contactability Deficit',
      count: 1124,
      pctOfDrops: 24.27,
      reasons: 'Unreachable after 3 attempts (805), Wrong or invalid number (319)',
      recoverability: 'COMMERCIAL_NEGOTIATION'
    },
    {
      cluster: '2. Sales Scheduling & Time Friction',
      count: 827,
      pctOfDrops: 17.85,
      reasons: 'Owner had no time for a visit (531), Visit not scheduled by sales (296)',
      recoverability: 'HIGH_RECOVERABILITY'
    },
    {
      cluster: '3. Pricing & Budget Hesitation',
      count: 728,
      pctOfDrops: 15.72,
      reasons: 'Price too high (414), Competitor offered cheaper plan (207), Decided to wait (107)',
      recoverability: 'HIGH_RECOVERABILITY'
    },
    {
      cluster: '4. Non-Enterprise Scope / Early Bounce',
      count: 750,
      pctOfDrops: 16.19,
      reasons: 'Not interested on first call (470), Only wanted a mobile plan (280)',
      recoverability: 'UNRECOVERABLE'
    },
    {
      cluster: '5. Incumbent Provider Lock-In',
      count: 325,
      pctOfDrops: 7.02,
      reasons: 'Locked in with current provider (325)',
      recoverability: 'COMMERCIAL_NEGOTIATION'
    },
    {
      cluster: '6. Proposal Complexity & Turnaround Delay',
      count: 385,
      pctOfDrops: 8.31,
      reasons: 'Quote too complex to understand (206), Quote took too long to arrive (179)',
      recoverability: 'HIGH_RECOVERABILITY'
    },
    {
      cluster: '7. KYC, Feasibility & Fulfillment Delay',
      count: 493,
      pctOfDrops: 10.64,
      reasons: 'Installation delayed >21d (98), Missing GST/Udyam (94), Found paperwork too long (79), Signatory unavailable (53), Cancelled pre-install (53), Document mismatch (47), Site not feasible (41), Payment failed (28)',
      recoverability: 'HIGH_RECOVERABILITY'
    }
  ];

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-500 text-sm">
        <svg className="animate-spin h-8 w-8 text-red-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Aggregating full 5,000 SMB lead dataset analytics from PostgreSQL...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Executive Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded border border-red-200 uppercase">
              Executive Analytics Audit
            </span>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 rounded border border-slate-200 uppercase">
              smb_leads.csv (5,000 Verified Records)
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            MSME Telecom Acquisition & Funnel Leakage Intelligence
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Verified ground-truth metrics: 5,000 Ingested Leads • 368 Organic Activations • 4,632 Dropped Pipeline.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadAnalyticsData}
            className="px-3.5 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition flex items-center gap-1.5"
          >
            ↻ Refresh Data
          </button>
          <Link
            href="/partner"
            className="px-3.5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm transition"
          >
            Open Partner Portal →
          </Link>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      {/* Top Level Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Total Ingested Leads</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{(funnel?.totalLeads ?? 5000).toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">smb_leads.csv ground truth</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Activated Customers</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{(funnel?.totalActivated ?? 368).toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">{funnel?.overallActivationRatePercent ?? 7.36}% organic rate</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Total Dropped Leads</p>
          <p className="text-2xl font-black text-red-600 mt-1">{(funnel?.totalDropped ?? 4632).toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-red-600 font-semibold mt-0.5">{funnel?.overallDropRatePercent ?? 92.64}% leakage</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase">High Priority Pipeline</p>
          <p className="text-2xl font-black text-purple-600 mt-1">{(impact?.highPriorityLeadsCount ?? 591).toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-purple-600 font-semibold mt-0.5">Score ≥ 70</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Medium Priority</p>
          <p className="text-2xl font-black text-amber-600 mt-1">{(impact?.mediumPriorityLeadsCount ?? 1862).toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Score 45–69</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Recovered Leads</p>
          <p className="text-2xl font-black text-blue-600 mt-1">{(impact?.recoveredCount ?? 0).toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-blue-600 font-semibold mt-0.5">Partner interventions</p>
        </div>
      </div>

      {/* Funnel Stage Leakage Visualization */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 mb-6 gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">End-to-End Acquisition Funnel & Stage Leakage (Verified)</h2>
            <p className="text-xs text-slate-500">Cumulative progression across milestone dates in smb_leads.csv (Appendix A1 Ground Truth)</p>
          </div>
          <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
            Steepest Drop: Needs Assessed → Quote Accepted (56.4% Drop)
          </span>
        </div>

        <div className="space-y-4">
          {funnel?.funnelStages?.map((stage, idx) => {
            const widthPercent = Math.max(7, Math.round((stage.leadCount / (funnel.totalLeads || 5000)) * 100));
            return (
              <div key={stage.stage} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-white font-bold text-[10px] flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-slate-900">{stage.stage}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-bold text-slate-900">{stage.leadCount.toLocaleString('en-IN')} leads</span>
                    <span className="text-slate-500 text-[11px] w-20 text-right">
                      {stage.conversionPercentFromTotal}% of base
                    </span>
                    {stage.dropCount > 0 ? (
                      <span className="text-red-600 font-semibold text-[11px] w-28 text-right">
                        -{stage.dropCount} dropped ({stage.dropRatePercent}%)
                      </span>
                    ) : (
                      <span className="text-emerald-600 font-semibold text-[11px] w-28 text-right">
                        Final Active
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${widthPercent}%` }}
                    className={`h-full rounded-full transition-all duration-500 ${
                      idx === 5 ? 'bg-emerald-600' : idx >= 3 ? 'bg-blue-600' : 'bg-red-500'
                    }`}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 leading-relaxed grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <strong className="text-slate-800 block mb-1">Top-of-Funnel Loss (1,594 drops):</strong>
            31.9% of leads are dropped before initial contact due to unreachable attempts (805) and invalid phone numbers (319).
          </div>
          <div>
            <strong className="text-slate-800 block mb-1">Mid-Funnel Friction (2,545 drops):</strong>
            Contacted and Needs Assessed phases lose 2,545 leads primarily due to field sales visit friction (531) and pricing hesitation (414).
          </div>
          <div>
            <strong className="text-slate-800 block mb-1">High-Value Bottom Leakage (493 drops):</strong>
            Quote Accepted (273) and KYC Complete (220) represent ₹1.7Cr in lost ARR due to paperwork friction and installation delays.
          </div>
        </div>
      </div>

      {/* 7 Root-Cause Clusters Matrix */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Consolidated 7 Root-Cause Clusters (All 4,632 Dropped Leads)</h2>
            <p className="text-xs text-slate-500">Mutually exclusive, collectively exhaustive classification of abandonment drivers</p>
          </div>
          <span className="text-[11px] font-semibold bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded">
            Audit Ground Truth
          </span>
        </div>

        <div className="space-y-3">
          {CONSOLIDATED_7_CLUSTERS.map((cl, idx) => (
            <div key={idx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{cl.cluster}</span>
                    {getRecoverabilityBadge(cl.recoverability)}
                  </div>
                  <p className="mt-1 text-slate-600 text-[11px]">
                    <strong className="text-slate-700">Sub-reasons:</strong> {cl.reasons}
                  </p>
                </div>
                <div className="text-right whitespace-nowrap">
                  <span className="font-mono font-black text-slate-900 text-sm">{cl.count.toLocaleString('en-IN')} leads</span>
                  <div className="text-[11px] text-slate-500 font-medium">{cl.pctOfDrops}% of drops</div>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div
                  style={{ width: `${cl.pctOfDrops * 3}%` }}
                  className={`h-full rounded-full ${
                    cl.recoverability === 'HIGH_RECOVERABILITY' ? 'bg-emerald-500' :
                    cl.recoverability === 'COMMERCIAL_NEGOTIATION' ? 'bg-amber-500' : 'bg-slate-400'
                  }`}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two Column Grid: All 20 Granular Drop Reasons & MSME Segment Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: All 20 Drop Reasons from PostgreSQL (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">All 20 Granular Drop Reasons (PostgreSQL Direct)</h2>
              <p className="text-xs text-slate-500">Live query over 4,632 dropped records in database</p>
            </div>
            <span className="text-[11px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
              20 Reasons
            </span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {dropReasons.map((r, idx) => (
              <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-center justify-between">
                <div className="flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{r.reason}</span>
                    {getRecoverabilityBadge(r.recoverableCategory)}
                  </div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <span className="font-bold text-slate-900">{r.count}</span>
                  <span className="text-slate-400 text-[11px] ml-1.5">({r.percentage}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: MSME Segment Analysis & Leaderboard (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* MSME Segment Matrix */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-1">MSME Segment Conversion Breakdown</h2>
            <p className="text-xs text-slate-500 mb-4">Observational historical qualification rate across 5,000 challenge records (correlational, not causal predictive)</p>

            <div className="space-y-3">
              {segments.map((seg) => (
                <div key={seg.segment} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-900 uppercase tracking-wide">{seg.segment}</span>
                    <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                      {seg.conversionRatePercent}% Converted
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-600 mt-2">
                    <div>
                      <span className="text-slate-400 block">Total Leads:</span>
                      <strong>{seg.totalLeads.toLocaleString('en-IN')}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Activated:</span>
                      <strong className="text-emerald-700">{seg.activatedLeads.toLocaleString('en-IN')}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Dropped:</span>
                      <strong className="text-red-600">{seg.droppedLeads.toLocaleString('en-IN')}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Channel Partner Performance Leaderboard */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-slate-900">Channel Partner Leaderboard</h2>
              <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                Demo Assumption: ₹2,500/order
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">Partner agency recovery counts and simulated commission</p>

            {partnerAuthRequired ? (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-center space-y-3">
                <div className="text-slate-600">
                  🔒 <strong>Staff & Partner Authorization Required</strong>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Individual partner performance, lead allocations, and financial commission metrics are restricted to authenticated partners and administrators.
                  </p>
                </div>
                <Link
                  href="/partner/login"
                  className="inline-block px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                >
                  Sign In to Partner Portal →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {partners.map((p) => (
                  <div key={p.partnerId} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900">{p.agencyName}</div>
                        <div className="text-[11px] text-slate-400 font-medium">
                          {p.partnerCode} • {p.territoryCity}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-700 text-xs">₹{p.commissionEarnedInr.toLocaleString('en-IN')}</div>
                        <div className="text-[10px] text-slate-400">Assumed Bounty (₹2.5k/ea)</div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-600">
                      <span>Assigned: <strong>{p.assignedLeads}</strong></span>
                      <span>Activities: <strong>{p.activitiesLogged}</strong></span>
                      <span>Recovered: <strong className="text-purple-700">{p.recoveredLeads}</strong></span>
                      <span className="font-bold text-slate-800">{p.recoveryRatePercent}% Rate</span>
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
