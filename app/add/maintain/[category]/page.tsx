const CATEGORY_LABELS: Record<string, string> = {
  hair:     'Hair',
  skin:     'Skin',
  nails:    'Nails',
  brows:    'Brows & Lashes',
  removal:  'Hair Removal',
  wellness: 'Wellness',
};

export default async function MaintainCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const label = CATEGORY_LABELS[category] ?? category;

  return (
    <main style={{ maxWidth: '480px', margin: '0 auto', padding: '40px 24px', textAlign: 'center' }}>
      <a
        href="/add"
        style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--sage)', textDecoration: 'none', display: 'block', marginBottom: '32px', textAlign: 'left' }}
      >
        Back
      </a>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '16px' }}>
        MAINTAIN SOMETHING
      </p>
      <h1 style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '36px', fontWeight: 400, color: 'var(--ink)', marginBottom: '16px' }}>
        {label}
      </h1>
      <div style={{ width: '40px', height: '1px', backgroundColor: 'var(--divider)', margin: '0 auto 20px' }} />
      <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '18px', color: 'var(--ink-faint)' }}>
        Coming soon.
      </p>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--ink-soft)', marginTop: '12px' }}>
        In the meantime, use{' '}
        <a href="/add/ritual" style={{ color: 'var(--sage)' }}>Add a Ritual</a>
        {' '}to browse the full library.
      </p>
    </main>
  );
}
