import { Scissors, Zap, Hand, Droplets, Eye, Heart, Sparkles } from 'lucide-react';
import { getCategoryColor } from '@/lib/categoryColors';

const MAINTAIN_CATEGORIES = [
  { label: 'Hair',           Icon: Scissors, path: 'hair' },
  { label: 'Skin',           Icon: Droplets, path: 'skin' },
  { label: 'Nails',          Icon: Hand,     path: 'nails' },
  { label: 'Brows & Lashes', Icon: Eye,      path: 'brows' },
  { label: 'Hair Removal',   Icon: Zap,      path: 'removal' },
  { label: 'Wellness',       Icon: Heart,    path: 'wellness' },
] as const;

const PREPARE_CATEGORIES = [
  { label: 'Wedding',  path: 'wedding' },
  { label: 'Vacation', path: 'vacation' },
  { label: 'Seasonal', path: 'seasonal' },
] as const;

export default function AddPage() {
  return (
    <main style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 24px' }}>
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
          {MAINTAIN_CATEGORIES.map(({ label, Icon, path }) => {
            const catColor = getCategoryColor(label);
            return (
              <a
                key={label}
                href={`/add/maintain/${path}`}
                style={{
                  backgroundColor: 'var(--paper-soft)',
                  borderRadius: '12px',
                  border: '1px solid var(--divider)',
                  borderTop: `3px solid ${catColor.dot}`,
                  padding: '14px 12px',
                  textAlign: 'center',
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Icon size={20} color={catColor.dot} strokeWidth={1.5} />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--ink)' }}>
                  {label}
                </span>
              </a>
            );
          })}
        </div>
      </section>

      {/* PREPARE FOR SOMETHING */}
      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '12px' }}>
          PREPARE FOR SOMETHING
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {PREPARE_CATEGORIES.map(({ label, path }) => (
            <a
              key={label}
              href={`/add/prepare/${path}`}
              style={{
                backgroundColor: 'var(--paper-soft)',
                borderRadius: '12px',
                border: '1px solid var(--divider)',
                borderTop: '3px solid var(--sage)',
                padding: '14px 12px',
                textAlign: 'center',
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Sparkles size={20} color="var(--sage)" strokeWidth={1.5} />
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--ink)' }}>
                {label}
              </span>
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

      {/* BUILD CUSTOM — above Add a Product so it stays reachable */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
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

      {/* ADD A PRODUCT — placeholder (BetaB) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--paper-soft)',
        borderRadius: '16px',
        border: '1px solid var(--divider)',
        padding: '20px',
        opacity: 0.45,
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
    </main>
  );
}
