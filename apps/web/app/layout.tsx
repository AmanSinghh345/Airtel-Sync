import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UdyamOne - MSME Telecom Onboarding Platform | Accel Business',
  description: 'Digital-first telecom acquisition & onboarding platform for MSMEs. Powered by Accel Business.'
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                  U
                </div>
                <div>
                  <span className="text-xl font-extrabold tracking-tight text-slate-900">Udyam<span className="text-red-600">One</span></span>
                  <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-red-50 text-red-700 rounded border border-red-200 uppercase tracking-wide">
                    Accel Business
                  </span>
                </div>
              </a>
            </div>
            <nav className="flex items-center gap-5 text-sm font-medium text-slate-600">
              <a href="/" className="hover:text-red-600 transition-colors">Catalog</a>
              <a href="/checkout" className="hover:text-red-600 transition-colors">Checkout</a>
              <a href="/tracking" className="hover:text-red-600 transition-colors">Track Order</a>
              <a href="/partner" className="hover:text-red-600 transition-colors font-semibold text-slate-900 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                Partner Portal
              </a>
              <a href="/analytics" className="hover:text-red-600 transition-colors">Analytics</a>
              <span className="hidden sm:inline-block h-4 w-px bg-slate-300"></span>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                DPDP 2023 Compliant
              </span>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-slate-200 bg-white mt-16 py-8 text-center text-xs text-slate-500">
          <p>© 2026 Accel Telecom / Accel Business. Airtel SYNC Hackathon 2026 Enterprise Track A.</p>
          <p className="mt-1 text-slate-400">All public tracking links are secured with SHA-256 one-way tokens and strict zero-PII masking.</p>
        </footer>
      </body>
    </html>
  );
}
