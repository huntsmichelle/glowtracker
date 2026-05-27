'use client';

interface DepletionBarProps {
  remainingAmount: number;
  totalAmount: number;
  usesDisplay?: string; // e.g. "3 of 16 uses left" or "less than 1 use left"
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
  usesDisplay,
  compact = false,
}: DepletionBarProps) {
  if (totalAmount <= 0) return null;
  const pct = Math.min(1, Math.max(0, remainingAmount / totalAmount));
  const { color, critical } = fillColor(pct);
  const h = compact ? 6 : 8;
  const isWarning = usesDisplay?.startsWith('less than') || usesDisplay === 'out of product';

  return (
    <div>
      <div style={{ height: `${h}px`, borderRadius: `${h / 2}px`, backgroundColor: '#cdc6b6', overflow: 'hidden' }}>
        <div
          className={critical ? 'depletion-critical' : undefined}
          style={{ height: '100%', width: `${pct * 100}%`, borderRadius: `${h / 2}px`, backgroundColor: color, transition: 'width 0.3s ease' }}
        />
      </div>
      {usesDisplay && (
        <p style={{ fontSize: '11px', color: isWarning ? '#c08a6e' : '#6b665e', marginTop: '3px' }}>
          {usesDisplay}
        </p>
      )}
    </div>
  );
}
