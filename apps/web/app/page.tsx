'use client';

import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '@/lib/api-config';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ExtractedEntities {
  businessName?: string;
  city?: string;
  cityTier?: number;
  segment?: string;
  employeeCount?: number;
  numSites?: number;
  hasGstin?: boolean;
  gstin?: string;
  primaryNeed?: string;
  confidenceScore?: number;
}

interface RecommendedItem {
  productId: string;
  productName: string;
  category: string;
  indicativeMonthlyInr: number;
  oneTimeSetupInr: number;
  reason: string;
}

interface RecommendationResult {
  bundleName: string;
  installationSlaDays: number;
  items: RecommendedItem[];
  quote?: {
    quoteNumber: string;
    totalMonthlyRecurringInr: number;
    totalOneTimeSetupInr: number;
    validDays: number;
  };
}

interface Product {
  id: string;
  category: string;
  productName: string;
  description: string;
  unit: string;
  priceMinInr: number;
  priceMaxInr: number;
  oneTimeSetupInr: number;
  typicalInstallDays: number;
}

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Namaste! Welcome to Accel Telecom. I am your AI Business Advisor. Tell me about your enterprise (e.g. your city, team size, and what connectivity or cloud services you need) in English, Hindi, or Hinglish!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [preferredLanguage, setPreferredLanguage] = useState<'English' | 'Hindi' | 'Hinglish'>('English');
  const [extractedProfile, setExtractedProfile] = useState<ExtractedEntities>({});
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);

  // Catalog State
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Generate or retrieve session token
    const token = 'session_' + Math.random().toString(36).substring(2, 12);
    setSessionToken(token);

    // Fetch product catalog for catalog explorer
    fetch(`${API_BASE_URL}/api/catalog/products`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputMessage('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/advisor/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          message: text,
          preferredLanguage
        })
      });

      if (!res.ok) throw new Error('Advisor request failed');

      const data = await res.json();

      const aiReply: ChatMessage = {
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, aiReply]);
      if (data.extractedEntities) {
        setExtractedProfile(data.extractedEntities);
      }
      if (data.missingFields) {
        setMissingFields(data.missingFields);
      }
      if (data.recommendation) {
        setRecommendation(data.recommendation);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered a temporary connection issue. Please check that your network is connected and try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const PROMPT_SUGGESTIONS = [
    'We run a textile shop in Surat with 8 employees, need high-speed internet',
    'Diagnostic clinic in Visakhapatnam with 15 staff, need fiber and security cameras',
    'Chartered accountant firm in Mumbai with 25 users, need cloud backup & static IP'
  ];

  const categories = ['ALL', 'CONNECTIVITY', 'SECURITY', 'CLOUD_PRODUCTIVITY', 'IOT_PHYSICAL', 'COMMUNICATION'];

  const filteredProducts = activeCategory === 'ALL'
    ? products
    : products.filter((p) => p.category === activeCategory);

  return (
    <div className="space-y-12">
      {/* Hero Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3 pt-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 rounded-full text-xs font-bold border border-red-200">
          <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
          Airtel SYNC Hackathon 2026 • Enterprise Track A
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight">
          Conversational <span className="text-red-600">AI Business Advisor</span>
        </h1>
        <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
          Describe your business needs in English, Hindi, or Hinglish. Our Gemini-powered AI extracts your requirements, matches optimal packages from our 25-product catalogue, and generates an instant formal quote.
        </p>
      </div>

      {/* Main AI Advisor Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Chatbot Interface (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col h-[650px]">
          {/* Chat Window Header */}
          <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-600 flex items-center justify-center font-bold text-white shadow-md">
                AI
              </div>
              <div>
                <h3 className="font-extrabold text-sm flex items-center gap-2">
                  UdyamOne Telecom Advisor
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                </h3>
                <p className="text-[11px] text-slate-400">Powered by Gemini + Accel Rule Engine</p>
              </div>
            </div>

            {/* Language Selector */}
            <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700 text-xs">
              {(['English', 'Hindi', 'Hinglish'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setPreferredLanguage(lang)}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                    preferredLanguage === lang
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {lang === 'Hindi' ? 'हिंदी' : lang}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Transcript */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 max-w-[85%] ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                    msg.role === 'user'
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-900 text-white'
                  }`}
                >
                  {msg.role === 'user' ? 'You' : 'AI'}
                </div>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm shadow-sm whitespace-pre-line leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-red-600 text-white rounded-tr-none'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                  }`}
                >
                  {msg.content}
                  <div
                    className={`text-[10px] mt-1 font-mono ${
                      msg.role === 'user' ? 'text-red-200 text-right' : 'text-slate-400'
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 max-w-[85%]">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                  AI
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-slate-500 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-bounce"></span>
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-bounce [animation-delay:0.4s]"></span>
                  <span className="text-xs">Analyzing requirements & verifying catalogue rules...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Starter Chips */}
          <div className="px-6 py-2 bg-slate-100 border-t border-slate-200 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="text-slate-500 font-semibold whitespace-nowrap text-[11px]">Quick try:</span>
            {PROMPT_SUGGESTIONS.map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(s)}
                className="bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1 rounded-full border border-slate-300 whitespace-nowrap text-[11px] transition-colors"
              >
                {s.length > 40 ? s.substring(0, 40) + '...' : s}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <div className="p-4 bg-white border-t border-slate-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={
                  preferredLanguage === 'Hindi'
                    ? 'अपने व्यापार की ज़रूरतें यहाँ लिखें...'
                    : preferredLanguage === 'Hinglish'
                    ? 'Apne business ki requirement yahan likhein...'
                    : 'Describe your business, city, employees, or telecom needs...'
                }
                disabled={isLoading}
                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-white transition-all"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || isLoading}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                Send
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </form>
          </div>
        </div>

        {/* Right: Live Extracted Profile & Instant Quote (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Extracted Profile Card */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <span>📋</span> Live Extracted MSME Profile
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase font-mono">
                {extractedProfile.city ? 'Profile Active' : 'Waiting for Input'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Business Name</span>
                <span className="font-bold text-slate-900 truncate block mt-0.5">
                  {extractedProfile.businessName || '—'}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Location & Tier</span>
                <span className="font-bold text-slate-900 block mt-0.5">
                  {extractedProfile.city ? (
                    <span className="inline-flex items-center gap-1.5">
                      {extractedProfile.city}
                      <span className="px-1.5 py-0.2 bg-blue-50 text-blue-700 font-extrabold text-[10px] rounded border border-blue-200">
                        Tier {extractedProfile.cityTier || 2}
                      </span>
                    </span>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Employees & Sites</span>
                <span className="font-bold text-slate-900 block mt-0.5">
                  {extractedProfile.employeeCount ? `${extractedProfile.employeeCount} staff` : '—'}
                  {extractedProfile.numSites ? ` (${extractedProfile.numSites} sites)` : ''}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">GSTIN Status</span>
                <span className="font-bold text-slate-900 block mt-0.5">
                  {extractedProfile.hasGstin ? (
                    <span className="text-emerald-600 font-bold">✓ Verified Active</span>
                  ) : extractedProfile.gstin ? (
                    <span className="text-amber-600 font-bold">Unverified</span>
                  ) : (
                    'Unspecified'
                  )}
                </span>
              </div>
            </div>

            {missingFields.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <span className="font-bold block mb-1">Awaiting details for quote finalization:</span>
                <div className="flex flex-wrap gap-1">
                  {missingFields.map((f, i) => (
                    <span key={i} className="px-2 py-0.5 bg-white rounded border border-amber-300 font-mono text-[10px]">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Generated Commercial Quote Card */}
          {recommendation ? (
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 rounded-3xl shadow-xl space-y-5 border border-slate-700 animate-in fade-in duration-300">
              <div className="flex items-center justify-between pb-3 border-b border-slate-700">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-red-400 font-bold">Recommended Solution</span>
                  <h4 className="font-extrabold text-base text-white">{recommendation.bundleName}</h4>
                </div>
                <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-full text-xs font-bold">
                  SLA: {recommendation.installationSlaDays} Days
                </span>
              </div>

              {/* Items List */}
              <div className="space-y-2.5">
                {recommendation.items.map((item, idx) => (
                  <div key={idx} className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-white">{item.productName}</div>
                      <div className="text-[11px] text-slate-400">{item.reason}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-400">₹{item.indicativeMonthlyInr.toLocaleString('en-IN')}/mo</div>
                      <div className="text-[10px] text-slate-400">+₹{item.oneTimeSetupInr.toLocaleString('en-IN')} setup</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quote Totals */}
              {recommendation.quote && (
                <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 space-y-2">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Monthly Recurring Total:</span>
                    <span className="font-bold font-mono text-white text-sm">
                      ₹{recommendation.quote.totalMonthlyRecurringInr.toLocaleString('en-IN')}/mo
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>One-Time Installation Fee:</span>
                    <span className="font-bold font-mono text-white">
                      ₹{recommendation.quote.totalOneTimeSetupInr.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-700 flex justify-between text-[11px] text-slate-400">
                    <span>Quote ID: {recommendation.quote.quoteNumber}</span>
                    <span>Valid for {recommendation.quote.validDays} days</span>
                  </div>
                </div>
              )}

              {/* Proceed to Checkout CTA */}
              <a
                href="/checkout"
                className="w-full block py-4 bg-red-600 hover:bg-red-500 text-white font-extrabold text-center text-sm rounded-xl shadow-lg transition-all"
              >
                Proceed to Digital KYC & Checkout with this Quote →
              </a>
            </div>
          ) : (
            <div className="bg-white p-8 rounded-3xl border border-dashed border-slate-300 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-xl font-bold">
                💡
              </div>
              <h4 className="font-bold text-slate-800 text-sm">No Quote Generated Yet</h4>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                Chat with the AI Advisor on the left to tell us about your business location, team size, and telecom needs. Your custom quote will appear right here!
              </p>
              <div className="pt-2">
                <a
                  href="/checkout"
                  className="inline-block px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors"
                >
                  Direct Checkout Flow →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product Catalogue Explorer */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h3 className="text-xl font-black text-slate-900">Explore Accel Enterprise Catalogue</h3>
            <p className="text-xs text-slate-500">25 normalized MSME telecom products with deterministic prerequisite resolution</p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeCategory === cat
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {cat.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((p) => (
            <div
              key={p.id}
              className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-red-300 hover:shadow-md transition-all flex flex-col justify-between space-y-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                    {p.id}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">
                    {p.category.replace('_', ' ')}
                  </span>
                </div>
                <h4 className="font-bold text-slate-900 text-sm">{p.productName}</h4>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{p.description}</p>
              </div>

              <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block">Monthly Price</span>
                  <span className="font-mono font-bold text-slate-900">
                    ₹{Number(p.priceMinInr).toLocaleString('en-IN')}
                    {Number(p.priceMaxInr) > Number(p.priceMinInr) ? ` – ₹${Number(p.priceMaxInr).toLocaleString('en-IN')}` : ''}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block">Install SLA</span>
                  <span className="font-bold text-emerald-700">{p.typicalInstallDays} Days</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
