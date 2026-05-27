'use client';

interface SpendBarProps {
  actual: number;
  projected: number;
}

export default function SpendBar({ actual, projected }: SpendBarProps) {
  const total = actual + projected;
  if (total <= 0) return null;
  const actualPct = (actual / total) * 100;
  const projectedPct = (projected / total) * 100;

  return (
    <div>
      <div style={{ height: '8px', borderRadius: '4px', backgroundColor: '#cdc6b6', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${actualPct}%`, height: '100%', backgroundColor: '#2b2823', transition: 'width 0.3s ease' }} />
        <div style={{ width: `${projectedPct}%`, height: '100%', backgroundColor: '#a8a297', transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span style={{ fontSize: '10px', color: '#a8a297', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Spent</span>
        <span style={{ fontSize: '10px', color: '#a8a297', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Projected</span>
      </div>
    </div>
  );
}
