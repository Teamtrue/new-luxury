'use client';

import { useState } from 'react';

const SAVINGS_DATA: Record<string, Record<string, [number, number]>> = {
  Cars: { '₹50K–₹1L': [4000, 9000], '₹1L–₹5L': [8000, 40000], '₹5L–₹20L': [40000, 200000], '₹20L+': [160000, 500000] },
  Electronics: { '₹50K–₹1L': [4000, 12000], '₹1L–₹5L': [8000, 50000], '₹5L–₹20L': [40000, 180000], '₹20L+': [160000, 400000] },
  Appliances: { '₹50K–₹1L': [5000, 14000], '₹1L–₹5L': [9000, 55000], '₹5L–₹20L': [45000, 190000], '₹20L+': [150000, 380000] },
  Travel: { '₹50K–₹1L': [6000, 15000], '₹1L–₹5L': [10000, 60000], '₹5L–₹20L': [50000, 200000], '₹20L+': [180000, 480000] },
  Insurance: { '₹50K–₹1L': [3000, 8000], '₹1L–₹5L': [7000, 35000], '₹5L–₹20L': [30000, 150000], '₹20L+': [120000, 350000] },
  'Real Estate': { '₹50K–₹1L': [5000, 12000], '₹1L–₹5L': [10000, 48000], '₹5L–₹20L': [48000, 210000], '₹20L+': [200000, 600000] },
};

const BUDGETS = ['₹50K–₹1L', '₹1L–₹5L', '₹5L–₹20L', '₹20L+'];

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

export default function SavingsCalculator() {
  const [cat, setCat] = useState('Electronics');
  const [budget, setBudget] = useState('₹1L–₹5L');
  const range = SAVINGS_DATA[cat][budget];

  return (
    <section style={{ background: 'var(--ink)', padding: '100px 48px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', background: 'var(--obsidian)', borderRadius: 16, padding: '64px 72px', border: '1px solid rgba(201,169,97,0.2)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{ fontSize: 11, letterSpacing: 4, color: 'var(--gold)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 14 }}>Savings Calculator</div>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 46, fontWeight: 600, color: 'var(--gold)', marginBottom: 12 }}>Calculate Your Savings</h2>
          <p style={{ color: 'var(--mute-dk)', fontSize: 15 }}>See what PlutusClub pricing could mean for your next big purchase.</p>
        </div>

        <div style={{ display: 'flex', gap: 24, marginBottom: 48, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>Product Category</label>
            <select value={cat} onChange={e => setCat(e.target.value)} style={{ width: '100%', background: 'var(--ink2)', border: '1px solid rgba(201,169,97,0.25)', color: 'var(--cream)', padding: '14px 16px', borderRadius: 8, fontSize: 15, cursor: 'pointer', outline: 'none' }}>
              {Object.keys(SAVINGS_DATA).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>Budget Range</label>
            <select value={budget} onChange={e => setBudget(e.target.value)} style={{ width: '100%', background: 'var(--ink2)', border: '1px solid rgba(201,169,97,0.25)', color: 'var(--cream)', padding: '14px 16px', borderRadius: 8, fontSize: 15, cursor: 'pointer', outline: 'none' }}>
              {BUDGETS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        <div style={{ background: 'rgba(201,169,97,0.07)', border: '1px solid rgba(201,169,97,0.25)', borderRadius: 12, padding: '40px', textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--mute-dk)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>You&apos;d save approximately</div>
          <div style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 52, fontWeight: 600, color: 'var(--gold)', transition: 'all 0.3s', lineHeight: 1 }}>
            {fmt(range[0])} – {fmt(range[1])}
          </div>
          <div style={{ fontSize: 14, color: 'var(--mute-dk)', marginTop: 12 }}>per year on {cat} purchases</div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--mute-dk)', textAlign: 'center', lineHeight: 1.6 }}>
          Based on our average 8–18% negotiated spread over retail price. Actual savings vary by brand, model, and timing.
        </p>

        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <a href="/signup" className="btn-gold" style={{ fontSize: 14, letterSpacing: 1.5 }}>Start Saving Today</a>
        </div>
      </div>
    </section>
  );
}
