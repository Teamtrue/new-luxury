import type { MemberTier } from "../types/index.js";

export const tierOrder: Record<MemberTier, number> = {
  silver: 1,
  gold: 2,
  platinum: 3,
  obsidian: 4
};

export const TIER_COLORS: Record<MemberTier, string> = {
  silver: "#A8A8B0",
  gold: "#C9A961",
  platinum: "#E8E4D8",
  obsidian: "#0A0A12"
};

export function canAccessDeal(memberTier: MemberTier, minimumTier: MemberTier): boolean {
  return tierOrder[memberTier] >= tierOrder[minimumTier];
}
