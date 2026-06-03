export default function Loading() {
  const bar = (w: string, h = '14px') => (
    <div style={{ width: w, height: h, borderRadius: '6px', backgroundColor: 'var(--divider)' }} />
  );

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-6 animate-pulse" aria-busy="true" aria-label="Loading">
      {/* Header */}
      <div className="space-y-2">
        {bar('80px', '10px')}
        {bar('60%', '28px')}
      </div>

      {/* Card / row placeholders */}
      <div className="space-y-3">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              border: '1px solid var(--divider)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              backgroundColor: 'var(--paper-soft)',
            }}
          >
            {bar('45%')}
            {bar('30%', '11px')}
          </div>
        ))}
      </div>
    </div>
  );
}
