export type MemberTier = "silver" | "gold" | "platinum" | "obsidian";

export interface MemberProfile {
  id: string;
  name: string;
  phone: string;
  tier: MemberTier;
  tokenBalance: number;
  savingsThisYear: number;
}

export interface DealSummary {
  id: string;
  title: string;
  category: string;
  imageUrl?: string;
  marketPrice: number;
  memberPrice: number;
  minTier: MemberTier;
  featured?: boolean;
}

export interface BookingSummary {
  id: string;
  dealId: string;
  dealTitle: string;
  bookingRef: string;
  amount: number;
  status: "active" | "completed" | "cancelled";
  createdAt: string;
}
