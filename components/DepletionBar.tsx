'use client';

interface DepletionBarProps {
  remainingAmount: number;
  totalAmount: number;
  unit?: string;
  usesRemaining?: number | null;
  showLabel?: boolean;
  compact?: boolean;
}

function fillColor(pct: number): { color: string; critical: boolean } {
  if (pct > 0.6) return { color: '#2b2823', critical: false };
  if (pct > 0.3) return { color: '#d4a478', critical: false };
  if (pct > 0.1) return { color: '#c08a6e', critical: false };
  return { color: '#c08a6e', critical: true };
}

export default function DepletionBar({
  remainingAmount,
  totalAmount,
  unit,
  usesRemaining,
  showLabel = true,
  compact = false,
}: DepletionBarProps) {
  if (totalAmount <= 0) return null;
  const pct = Math.min(1, Math.max(0, remainingAmount / totalAmount));
  const { color, critical } = fillColor(pct);
  const h = compact ? 6 : 8;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ flex: 1, height: `${h}px`, borderRadius: `${h / 2}px`, backgroundColor: '#cdc6b6', overflow: 'hidden' }}>
          <div
            className={critical ? 'depletion-critical' : undefined}
            style={{ height: '100%', width: `${pct * 100}%`, borderRadius: `${h / 2}px`, backgroundColor: color, transition: 'width 0.3s ease' }}
          />
        </div>
        {showLabel && (
          <span style={{ fontSize: '11px', color: '#a8a297', fontVariantNumeric: 'tabular-nums', minWidth: '30px', textAlign: 'right' }}>
            {Math.round(pct * 100)}%
          </span>
        )}
      </div>
      {usesRemaining != null && (
        <p style={{ fontSize: '11px', color: '#6b665e', marginTop: '3px' }}>≈ {usesRemaining} uses remaining</p>
      )}
    </div>
  );
}
