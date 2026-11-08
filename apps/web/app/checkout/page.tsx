'use client';

import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api-config';

interface QuoteItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceInr: number;
  unitSetupInr: number;
}

interface OrderConfirmation {
  orderId: string;
  orderNumber: string;
  trackingToken: string;
  status: string;
  calculatedSlaDays: number;
  estimatedActiveDate: string;
  isGuaranteedSla: boolean;
  totalMonthlyRecurringInr: number;
  totalOneTimeSetupInr: number;
  totalIndicativeFirstYearInr: number;
  itemCount: number;
  trackingUrl: string;
}

export default function CheckoutPage() {
  const [businessId, setBusinessId] = useState('BIZ-PHASE5-VERIFIED');
  const [quoteId, setQuoteId] = useState('');
  const [contactName, setContactName] = useState('Anita Kulkarni');
  const [contactPhone] = useState('+91 9876543210');
  const [installationAddress, setInstallationAddress] = useState('Shop 217, Commercial Complex, Dwaraka Nagar');
  const [city, setCity] = useState('Visakhapatnam');
  const [state, setState] = useState('Andhra Pradesh');
  const [pincode, setPincode] = useState('530016');
  const [consentConfirmed, setConsentConfirmed] = useState(true);

  // Status & State
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);

  // Preset demo applicants for instant reviewer testing
  const PRESET_APPLICANTS = [
    {
      id: 'BIZ-PHASE5-VERIFIED',
      label: 'Kaveri Insurance Advisors (KYC Verified)',
      contact: 'Anita Kulkarni',
      phone: '+91 9876543210',
      address: 'Shop 217, Commercial Complex, Dwaraka Nagar',
      city: 'Visakhapatnam',
      state: 'Andhra Pradesh',
      pincode: '530016',
      kycBadge: 'VERIFIED',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300'
    },
    {
      id: 'BIZ-PHASE5-OVERRIDDEN',
      label: 'Ganesh Woodcraft (Officer Overridden Verified)',
      contact: 'Ramesh Patel',
      phone: '+91 9822012345',
      address: 'Plot 42, MIDC Hingna Industrial Area',
      city: 'Nagpur',
      state: 'Maharashtra',
      pincode: '440028',
      kycBadge: 'OVERRIDDEN_VERIFIED',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-300'
    },
    {
      id: 'BIZ-PHASE5-MANUAL',
      label: 'Apex Auto Electricals (KYC Flagged / Manual Review - Test Rejection)',
      contact: 'Vikram Seth',
      phone: '+91 9811223344',
      address: 'Plot 88, Peenya 2nd Stage',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560058',
      kycBadge: 'MANUAL_REVIEW',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300'
    }
  ];

  const handleSelectApplicant = (applicantId: string) => {
    const selected = PRESET_APPLICANTS.find((a) => a.id === applicantId);
    if (!selected) return;
    setBusinessId(selected.id);
    setContactName(selected.contact);
    setInstallationAddress(selected.address);
    setCity(selected.city);
    setState(selected.state);
    setPincode(selected.pincode);
    setErrorMsg(null);
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consentConfirmed) {
      setErrorMsg('You must provide DPDP-compliant affirmative consent to proceed with order creation.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/orders/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          quoteId: quoteId || undefined,
          contactName,
          contactPhone,
          installationAddress,
          city,
          state,
          pincode
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Checkout failed (${response.status})`);
      }

      setConfirmation(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error occurred during checkout.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-red-600 uppercase tracking-wider">
          <span>Phase 5</span>
          <span>•</span>
          <span>Order Fulfillment</span>
        </div>
        <h1 className="mt-1 text-3xl font-extrabold text-slate-900 tracking-tight">
          Enterprise Telecom Checkout
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Transactional order creation guarded by statutory KYC eligibility, catalogue prerequisite checks, and high-entropy cryptographic tracking tokens.
        </p>
      </div>

      {/* Confirmation View */}
      {confirmation ? (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-xl overflow-hidden p-8 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl font-bold">
              ✓
            </div>
            <div>
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Order Placed Successfully
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900 mt-1">
                Order #{confirmation.orderNumber}
              </h2>
            </div>
          </div>

          {/* Critical Security Banner */}
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Save Your Secure Tracking Secret (Shown Only Once)</span>
            </div>
            <p className="text-xs text-amber-900 leading-relaxed">
              In accordance with our zero-knowledge tracking architecture, this raw secret is <strong className="underline">never stored in plaintext</strong> in our database. Accel Telecom stores only the irreversible SHA-256 cryptographic hash. If lost, tracking must be re-authenticated via support.
            </p>
            <div className="p-3 bg-white rounded-lg border border-amber-300 font-mono text-sm break-all text-slate-800 font-semibold select-all">
              {confirmation.trackingToken}
            </div>
          </div>

          {/* Pricing & SLA Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-xs font-medium text-slate-500">Monthly Recurring</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">
                ₹{confirmation.totalMonthlyRecurringInr.toLocaleString('en-IN')}
                <span className="text-xs text-slate-500 font-normal"> /mo</span>
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-xs font-medium text-slate-500">One-Time Setup Fee</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">
                ₹{confirmation.totalOneTimeSetupInr.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-4 bg-red-50 rounded-xl border border-red-200">
              <div className="text-xs font-medium text-red-600">Calculated SLA</div>
              <div className="text-2xl font-extrabold text-red-700 mt-1">
                {confirmation.calculatedSlaDays} Days
              </div>
              <div className="text-[11px] text-red-600 mt-0.5">
                Target: {confirmation.estimatedActiveDate} (Engineering Estimate)
              </div>
            </div>
          </div>

          {/* Tracking Button */}
          <div className="pt-4 flex flex-col sm:flex-row gap-3">
            <a
              href={`/tracking?token=${encodeURIComponent(confirmation.trackingToken)}`}
              className="flex-1 inline-flex items-center justify-center px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow transition-colors"
            >
              Open Live Public Order Tracker →
            </a>
            <button
              onClick={() => {
                setConfirmation(null);
                setQuoteId('');
              }}
              className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
            >
              Place Another Order
            </button>
          </div>
        </div>
      ) : (
        /* Checkout Form */
        <form onSubmit={handleCheckout} className="space-y-6">
          {/* Preset Applicant Selector */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-900">
                Select Test Applicant (from Phase 4 Registry Verification)
              </label>
              <span className="text-xs text-slate-500 font-mono">KYC Gate Engine</span>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {PRESET_APPLICANTS.map((app) => (
                <div
                  key={app.id}
                  onClick={() => handleSelectApplicant(app.id)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                    businessId === app.id
                      ? 'border-red-600 bg-red-50/40 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm text-slate-900">{app.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {app.contact} • {app.city}, {app.state}
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${app.badgeColor}`}>
                    {app.kycBadge}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Quote & Installation Details */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-slate-500">
              Installation & Delivery Parameters
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Contact Authorized Person
                </label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Contact Phone Number
                </label>
                <input
                  type="text"
                  required
                  disabled
                  value={contactPhone}
                  className="w-full px-3 py-2 text-sm border border-slate-200 bg-slate-50 rounded-lg text-slate-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Installation Physical Address
                </label>
                <input
                  type="text"
                  required
                  value={installationAddress}
                  onChange={(e) => setInstallationAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
                <input
                  type="text"
                  required
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Pincode</label>
                <input
                  type="text"
                  required
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Quote ID (Optional - Auto-resolves accepted quote if empty)
                </label>
                <input
                  type="text"
                  placeholder="e.g. QUOTE-2026-XXXX"
                  value={quoteId}
                  onChange={(e) => setQuoteId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Statutory Consent & Error Alert */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentConfirmed}
                onChange={(e) => setConsentConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <span className="text-xs text-slate-600 leading-relaxed">
                I hereby grant consent under the <strong>Digital Personal Data Protection (DPDP) Act, 2023</strong> for Accel Telecom to process my enterprise details, perform optical line feasibility surveys, and dispatch field technicians for installation. I understand that the installation timeline is an engineering estimate and not a guaranteed SLA.
              </span>
            </label>

            {errorMsg && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="space-y-1">
                  <div className="font-bold">Checkout Blocked by Gate Engine</div>
                  <div className="text-xs">{errorMsg}</div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-4 text-white font-extrabold text-base rounded-xl shadow-lg transition-all ${
                loading
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 active:scale-[0.99]'
              }`}
            >
              {loading ? 'Verifying Gate Eligibility & Placing Order...' : 'Confirm & Place Enterprise Telecom Order'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
