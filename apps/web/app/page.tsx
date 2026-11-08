import React from 'react';

export default function HomePage() {
  const PHASES = [
    {
      phase: 'Phase 1',
      title: 'Foundation & Registry Seeding',
      description: 'Normalized PostgreSQL schema, seed validation for GSTIN/Udyam registries, SMB leads, and prerequisite constraints.',
      status: 'VERIFIED'
    },
    {
      phase: 'Phase 2',
      title: 'Product Catalogue & Dynamic Quote Engine',
      description: 'Deterministic rule-based eligibility, recursive prerequisite resolution, Decimal monetary pricing within ranges.',
      status: 'VERIFIED'
    },
    {
      phase: 'Phase 3',
      title: 'Conversational AI Business Advisor',
      description: 'Multilingual Gemini natural language advisor with strict schema validation and deterministic fallback.',
      status: 'VERIFIED'
    },
    {
      phase: 'Phase 4',
      title: 'Digital KYC & Registry Verification',
      description: 'Tesseract OCR image extraction, quality checks, GSTIN/Udyam cross-verification, and role-authorized overrides.',
      status: 'VERIFIED'
    },
    {
      phase: 'Phase 5',
      title: 'Checkout, Order State Machine & Public Tracking',
      description: 'KYC-gated checkout, SHA-256 hashed secret tokens, zero-PII public tracking, and 5-stage SLA state machine.',
      status: 'ACTIVE'
    }
  ];

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto space-y-4 pt-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 rounded-full text-xs font-bold border border-red-200">
          <span className="w-2 h-2 rounded-full bg-red-600"></span>
          Airtel SYNC Hackathon 2026 • Enterprise Track A
        </div>
        <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight">
          Udyam<span className="text-red-600">One</span>: Digital-First MSME Telecom Onboarding
        </h1>
        <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
          The unified digital acquisition, verification, dynamic quote, and fulfillment platform designed for Indian Micro, Small & Medium Enterprises. Powered by Accel Business.
        </p>

        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <a
            href="/checkout"
            className="px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition-all"
          >
            Launch Checkout Flow →
          </a>
          <a
            href="/tracking"
            className="px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-xl border border-slate-300 shadow-sm transition-all"
          >
            Track Telecom Order
          </a>
        </div>
      </div>

      {/* Quick Architecture Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold text-lg">
            🔒
          </div>
          <h3 className="font-bold text-base text-slate-900">Zero-Knowledge Tracking</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Raw tracking secrets are returned exactly once upon checkout. Accel Telecom stores only the irreversible SHA-256 cryptographic hash. Public tracking responses strictly strip all database UUIDs and mask customer PII.
          </p>
        </div>

        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-lg">
            🛡️
          </div>
          <h3 className="font-bold text-base text-slate-900">KYC Gate Engine</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Orders can only be placed for businesses verified via government GSTIN and Udyam registries, or cleared by authenticated Compliance Officer overrides. Unverified or flagged applicants are strictly blocked.
          </p>
        </div>

        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
            ⏱️
          </div>
          <h3 className="font-bold text-base text-slate-900">Dynamic SLA State Machine</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Installation timelines are dynamically calculated from enrolled product typical install days. A 5-stage sequential state machine enforces operational milestones with audit trails and engineering estimate disclaimers.
          </p>
        </div>
      </div>

      {/* Implementation Roadmap Status */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">UdyamOne Implementation Roadmap</h3>
            <p className="text-xs text-slate-500">Phased architecture progress for Airtel SYNC Hackathon 2026</p>
          </div>
          <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200">
            Phases 1–5 Built & Verified
          </span>
        </div>

        <div className="space-y-4">
          {PHASES.map((p, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-red-600 font-mono">{p.phase}</span>
                  <span className="text-sm font-bold text-slate-900">{p.title}</span>
                </div>
                <p className="text-xs text-slate-600">{p.description}</p>
              </div>
              <span className={`self-start sm:self-center text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
                p.status === 'VERIFIED'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-red-100 text-red-800 border-red-300'
              }`}>
                {p.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
