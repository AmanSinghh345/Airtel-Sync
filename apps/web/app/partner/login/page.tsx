'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api-config';

export default function PartnerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Demo accounts for instant one-click login
  const DEMO_ACCOUNTS = [
    {
      title: 'Vizag Fiber Connect',
      role: 'Channel Partner',
      agencyCode: 'PTN-VIZAG-01',
      territory: 'Visakhapatnam & North Coastal AP',
      email: 'partner.vizag@accel.telecom',
      password: 'Accel@2026!PartnerVizag',
      color: 'border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-900',
      badgeColor: 'bg-blue-200 text-blue-800'
    },
    {
      title: 'Nagpur Enterprise Solutions',
      role: 'Channel Partner',
      agencyCode: 'PTN-NAGPUR-01',
      territory: 'Nagpur & Vidarbha Industrial Zone',
      email: 'partner.nagpur@accel.telecom',
      password: 'Accel@2026!PartnerNagpur',
      color: 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900',
      badgeColor: 'bg-amber-200 text-amber-800'
    },
    {
      title: 'Capital Business Networks',
      role: 'Channel Partner',
      agencyCode: 'PTN-DELHI-01',
      territory: 'Delhi NCR Commercial Hubs',
      email: 'partner.delhi@accel.telecom',
      password: 'Accel@2026!PartnerDelhi',
      color: 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900',
      badgeColor: 'bg-emerald-200 text-emerald-800'
    },
    {
      title: 'Accel Telecom Operations & Admin HQ',
      role: 'Administrator',
      agencyCode: 'CORP-HQ',
      territory: 'National / All MSME Territories',
      email: 'admin@accel.telecom',
      password: 'Accel@2026!Admin',
      color: 'border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-900',
      badgeColor: 'bg-purple-200 text-purple-800'
    }
  ];

  useEffect(() => {
    // Check if already logged in
    const token = localStorage.getItem('udyamone_token');
    if (token) {
      router.push('/partner');
    }
  }, [router]);

  const handleLogin = async (e?: React.FormEvent, customEmail?: string, customPass?: string) => {
    if (e) e.preventDefault();
    const loginEmail = customEmail || email;
    const loginPass = customPass || password;

    if (!loginEmail || !loginPass) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/staff/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPass })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || `Login failed (${res.status})`);
      }

      // Store JWT token and user profile securely in client storage
      localStorage.setItem('udyamone_token', data.accessToken);
      localStorage.setItem('udyamone_user', JSON.stringify(data.user));

      router.push('/partner');
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const selectDemoAccount = (acc: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    handleLogin(undefined, acc.email, acc.password);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded-full text-red-700 text-xs font-semibold uppercase tracking-wider mb-3">
          <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
          Partner & Staff Portal
        </div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight sm:text-4xl">
          Channel Partner & Lead Recovery Login
        </h1>
        <p className="mt-2 text-base text-slate-600 max-w-2xl mx-auto">
          Secure, authenticated workspace for authorized Accel Telecom enterprise partners to recover dropped MSME leads, conduct field outreach, and track commission milestones.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Quick 1-Click Login Cards for Evaluators */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">One-Click Evaluator Accounts</h2>
              <p className="text-xs text-slate-500">Select any pre-configured partner or admin to authenticate instantly</p>
            </div>
            <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
              RFC 7519 Signed JWT
            </span>
          </div>

          <div className="space-y-3">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => selectDemoAccount(acc)}
                disabled={loading}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-150 flex flex-col justify-between ${acc.color} shadow-sm group hover:shadow`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm tracking-tight">{acc.title}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${acc.badgeColor}`}>
                        {acc.role}
                      </span>
                    </div>
                    <p className="text-xs mt-1 text-slate-600 font-medium">
                      Territory: <span className="font-semibold text-slate-800">{acc.territory}</span>
                    </p>
                  </div>
                  <span className="text-xs font-semibold underline text-slate-700 group-hover:text-black">
                    Login →
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>{acc.email}</span>
                  <span className="bg-white/80 px-1.5 py-0.5 rounded border border-slate-200 text-[10px]">
                    Code: {acc.agencyCode}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
            <span className="font-bold text-slate-800">🔒 Multi-Tenant Data Isolation:</span> Each partner login issues a cryptographically verified JWT scoping API queries strictly to leads assigned to that partner's agency. Cross-partner access is blocked with 403 Forbidden.
          </div>
        </div>

        {/* Right Column: Standard Credentials Form */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-1">Standard Sign-In</h2>
          <p className="text-xs text-slate-500 mb-5">Enter your staff or partner email credentials</p>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Corporate Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@accel.telecom"
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Authenticating...
                </>
              ) : (
                'Sign In to Portal'
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-200 text-center">
            <span className="text-xs text-slate-500">
              Need executive analytics instead?{' '}
              <a href="/analytics" className="text-red-600 font-semibold hover:underline">
                View Funnel Analytics →
              </a>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
