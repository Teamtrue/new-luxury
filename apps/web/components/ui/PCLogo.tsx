import Link from 'next/link';

interface PCLogoProps {
  size?: number;
  href?: string;
}

export function PCLogo({ size = 28, href = '/' }: PCLogoProps) {
  const inner = (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="18.5" stroke="var(--gold)" strokeWidth="1.2"/>
        <circle cx="20" cy="20" r="14" stroke="var(--gold)" strokeWidth="0.5" strokeOpacity="0.5"/>
        <text x="20" y="27" textAnchor="middle" fontFamily="'Cormorant Garamond', serif"
          fontSize="20" fontWeight="600" fill="var(--gold)" letterSpacing="-1">P</text>
      </svg>
      <span style={{
        fontSize: size * 0.68,
        fontWeight: 500,
        color: 'var(--cream)',
        letterSpacing: 2.8,
        textTransform: 'uppercase',
        fontFamily: 'inherit',
      }}>PlutusClub</span>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{inner}</Link> : inner;
}
