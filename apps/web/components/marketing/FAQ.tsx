'use client';

import { useState } from 'react';

const FAQS = [
  {
    q: 'How does PlutusClub negotiate prices?',
    a: 'We aggregate demand from our 3 lakh+ member base and approach brands and suppliers with bulk purchase commitments. This gives us institutional-level bargaining power — the same leverage that large corporations use. Brands prefer selling 10,000 units at a slight discount to selling 100 units at full price.',
  },
  {
    q: 'What categories are available?',
    a: 'We cover 60+ categories including Cars & Automobiles, Consumer Electronics, Home Appliances, Travel & Hotels, Health Insurance, Life Insurance, Real Estate, Jewellery, Furniture, Two-Wheelers, Laptops, Mobile Phones, Air Conditioners, Refrigerators, Washing Machines, and much more. Gold+ members access all categories.',
  },
  {
    q: 'How do PC Tokens work?',
    a: 'PC Tokens are our loyalty currency. You earn tokens on every purchase — Silver members earn 1%, Gold 1.25%, Platinum 1.5%, and Obsidian 2% of purchase value as tokens. 1 PC Token = ₹0.50. Tokens can be redeemed on future purchases — Silver/Gold can redeem up to 20% of order value, Platinum up to 30%, and Obsidian up to 50%.',
  },
  {
    q: 'Is my membership fee refundable?',
    a: 'Yes, we offer a 30-day satisfaction guarantee. If you feel PlutusClub did not deliver value in your first 30 days, contact our support team for a full refund of your membership fee — no questions asked. After 30 days, memberships are non-refundable but can be cancelled at renewal.',
  },
  {
    q: 'Can I upgrade my tier during the year?',
    a: 'Absolutely. You can upgrade your tier at any time and only pay the prorated difference for the remaining months. Downgrades take effect at the next renewal date. Upgrades are instant — your new tier benefits activate immediately upon payment.',
  },
  {
    q: 'How is PlutusClub different from cashback apps or coupons?',
    a: 'Cashback apps work after purchase and are funded by marketing budgets — brands raise base prices to fund these promotions. PlutusClub negotiates the actual procurement price before you buy. The saving is structural, not a rebate. Think of it as the difference between a retail price and an institutional price — and we give you institutional access.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  const toggle = (i: number) => setOpen(prev => (prev === i ? null : i));

  return (
    <section id="faq" style={{ background: 'var(--obsidian)', padding: '100px 48px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{ fontSize: 11, letterSpacing: 4, color: 'var(--gold)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 16 }}>
            Questions &amp; Answers
          </div>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 48, fontWeight: 600, color: 'var(--cream)' }}>
            Frequently Asked
          </h2>
          <div style={{ width: 48, height: 2, background: 'var(--gold)', margin: '20px auto 0' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: '1px solid var(--line-dk)' }}>
              <button
                onClick={() => toggle(i)}
                style={{ width: '100%', background: 'none', border: 'none', color: open === i ? 'var(--gold)' : 'var(--cream)', textAlign: 'left', padding: '24px 0', cursor: 'pointer', fontSize: 17, fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, transition: 'color 0.2s' }}
              >
                <span>{faq.q}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: 'transform 0.3s ease', transform: open === i ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <div style={{ overflow: 'hidden', maxHeight: open === i ? 300 : 0, transition: 'max-height 0.35s ease' }}>
                <p style={{ color: 'var(--mute-dk)', fontSize: 15, lineHeight: 1.75, paddingBottom: 24 }}>
                  {faq.a}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
