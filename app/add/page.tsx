export default function AddPage() {
  return (
    <main style={{
      maxWidth: '560px',
      margin: '0 auto',
      padding: '40px 24px',
    }}>
      <h1 style={{
        fontFamily: 'EB Garamond, Georgia, serif',
        fontSize: '32px',
        color: 'var(--ink)',
        fontWeight: 400,
        marginBottom: '32px',
      }}>
        What would you like to add?
      </h1>

      {/* MAINTAIN SOMETHING */}
      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '12px' }}>
          MAINTAIN SOMETHING
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {[
            { label: 'Hair',           emoji: '✂️', path: 'hair' },
            { label: 'Skin',           emoji: '💧', path: 'skin' },
            { label: 'Nails',          emoji: '💅', path: 'nails' },
            { label: 'Brows & Lashes', emoji: '👁',  path: 'brows' },
            { label: 'Hair Removal',   emoji: '⚡', path: 'removal' },
            { label: 'Wellness',       emoji: '🤍', path: 'wellness' },
          ].map(cat => (
            <a
              key={cat.label}
              href={`/add/maintain/${cat.path}`}
              style={{
                backgroundColor: 'var(--paper-soft)',
                borderRadius: '12px',
                border: '1px solid var(--divider)',
                padding: '16px 12px',
                textAlign: 'center',
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '24px' }}>{cat.emoji}</span>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--ink)' }}>{cat.label}</span>
            </a>
          ))}
        </div>
      </section>

      {/* PREPARE FOR SOMETHING */}
      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '12px' }}>
          PREPARE FOR SOMETHING
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {[
            { label: 'Wedding',  emoji: '💍', path: 'wedding' },
            { label: 'Vacation', emoji: '✈️', path: 'vacation' },
            { label: 'Seasonal', emoji: '🌿', path: 'seasonal' },
          ].map(cat => (
            <a
              key={cat.label}
              href={`/add/prepare/${cat.path}`}
              style={{
                backgroundColor: 'var(--paper-soft)',
                borderRadius: '12px',
                border: '1px solid var(--divider)',
                padding: '16px 12px',
                textAlign: 'center',
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '24px' }}>{cat.emoji}</span>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--ink)' }}>{cat.label}</span>
            </a>
          ))}
        </div>
      </section>

      {/* ADD A RITUAL */}
      <a
        href="/add/ritual"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--paper-soft)',
          borderRadius: '16px',
          border: '1px solid var(--divider)',
          padding: '20px',
          textDecoration: 'none',
          marginBottom: '10px',
        }}
      >
        <div>
          <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '20px', color: 'var(--ink)', margin: 0, fontWeight: 400 }}>Add a Ritual</p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--ink-soft)', margin: '4px 0 0' }}>
            Search our library and add a single ritual with recommended settings.
          </p>
        </div>
        <span style={{ fontSize: '20px', color: 'var(--ink-faint)' }}>›</span>
      </a>

      {/* ADD A PRODUCT — placeholder */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--paper-soft)',
        borderRadius: '16px',
        border: '1px solid var(--divider)',
        padding: '20px',
        opacity: 0.45,
        marginBottom: '24px',
        cursor: 'default',
      }}>
        <div>
          <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '20px', color: 'var(--ink-faint)', margin: 0, fontWeight: 400 }}>Add a Product</p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--ink-faint)', margin: '4px 0 0' }}>
            Coming soon — track products and get restock reminders.
          </p>
        </div>
        <span style={{ fontSize: '20px', color: 'var(--ink-faint)' }}>›</span>
      </div>

      {/* BUILD CUSTOM */}
      <div style={{ textAlign: 'center' }}>
        <a
          href="/tasks/new"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            color: 'var(--ink-faint)',
            textDecoration: 'underline',
          }}
        >
          Build something custom
        </a>
      </div>
    </main>
  );
}
