export type Tier = 'silver' | 'gold' | 'platinum' | 'obsidian';
export type MemberStatus = 'active' | 'expired' | 'suspended' | 'pending';
export type DealStatus = 'active' | 'pending' | 'expiring_soon' | 'archived';
export type BookingStatus = 'pending_payment' | 'confirmed' | 'processing' | 'delivered' | 'cancelled';
export type PaymentMethod = 'upi' | 'netbanking' | 'card' | 'emi';
export type TokenTxnType = 'earned' | 'redeemed' | 'bonus' | 'expired';

export interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: Tier;
  status: MemberStatus;
  tokens: number;
  joined: string;
  membership_expires: string;
  referral_code: string;
  referred_by?: string;
  avatar_url?: string;
}

export interface Deal {
  id: string;
  title: string;
  category: string;
  brand: string;
  description: string;
  club_price: number;
  retail_price: number;
  min_tier: Tier;
  status: DealStatus;
  expires_at: string;
  max_bookings?: number;
  current_bookings: number;
  tokens_earn_rate: number;
  image_url?: string;
  created_at: string;
}

export interface Booking {
  id: string;
  member_id: string;
  deal_id: string;
  deal_title: string;
  deal_category: string;
  amount_paid: number;
  tokens_used: number;
  tokens_earned: number;
  payment_method: PaymentMethod;
  status: BookingStatus;
  delivery_address: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  created_at: string;
  updated_at: string;
}

export interface TokenTransaction {
  id: string;
  member_id: string;
  type: TokenTxnType;
  amount: number;
  description: string;
  reference?: string;
  created_at: string;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referee_id: string;
  referee_name: string;
  referee_tier: Tier;
  status: 'active' | 'expired' | 'churned';
  joined_at: string;
  total_purchases: number;
  trail_commission_earned: number;
  token_bonus: number;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
}

export interface DashboardStats {
  savings_this_year: number;
  token_balance: number;
  active_bookings: number;
  member_since_months: number;
}
