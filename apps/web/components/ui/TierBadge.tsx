import { Tier } from '@/lib/types';
import { TIER_COLORS, TIER_LABELS } from '@/lib/utils';

export function TierBadge({ tier, size = 'sm' }: { tier: Tier; size?: 'sm' | 'md' }) {
  const color = TIER_COLORS[tier];
  const padding = size === 'sm' ? '2px 8px' : '4px 12px';
  const fontSize = size === 'sm' ? 10 : 12;
  return (
    <span style={{
      background: color + '22',
      color,
      border: `1px solid ${color}44`,
      padding,
      borderRadius: 20,
      fontSize,
      fontWeight: 600,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {TIER_LABELS[tier]}
    </span>
  );
}
