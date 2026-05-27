import { type ClassValue, clsx } from 'clsx';
import { Tier } from './types';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function fmtINR(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN');
}

export function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function savingsPct(clubPrice: number, retailPrice: number): number {
  return Math.round((1 - clubPrice / retailPrice) * 100);
}

export function tierOrder(tier: Tier): number {
  return { silver: 0, gold: 1, platinum: 2, obsidian: 3 }[tier];
}

export function canAccessDeal(memberTier: Tier, minTier: Tier): boolean {
  return tierOrder(memberTier) >= tierOrder(minTier);
}

export function tokenValue(tokens: number): number {
  return tokens * 0.5;
}

export function tokensEarned(amount: number, tier: Tier): number {
  const rates: Record<Tier, number> = {
    silver: 0.01,
    gold: 0.0125,
    platinum: 0.015,
    obsidian: 0.02,
  };
  return Math.floor(amount * rates[tier]);
}

export function maxTokenRedemption(totalAmount: number, tier: Tier): number {
  const pcts: Record<Tier, number> = {
    silver: 0.2,
    gold: 0.2,
    platinum: 0.3,
    obsidian: 0.5,
  };
  return Math.floor((totalAmount * pcts[tier]) / 0.5);
}

export const TIER_COLORS: Record<Tier, string> = {
  silver: '#8a9bac',
  gold: '#C9A961',
  platinum: '#b0c4d8',
  obsidian: '#C9A961',
};

export const TIER_LABELS: Record<Tier, string> = {
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  obsidian: 'Obsidian',
};

export const TIER_PRICES: Record<Tier, { base: number; gst: number; total: number }> = {
  silver:   { base: 999,   gst: 180,  total: 1179 },
  gold:     { base: 3999,  gst: 720,  total: 4719 },
  platinum: { base: 9999,  gst: 1800, total: 11799 },
  obsidian: { base: 24999, gst: 4500, total: 29499 },
};
