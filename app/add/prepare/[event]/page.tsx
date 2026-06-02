const EVENT_LABELS: Record<string, string> = {
  wedding:  'Wedding',
  vacation: 'Vacation',
  seasonal: 'Seasonal',
};

export default async function PrepareEventPage({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event } = await params;
  const label = EVENT_LABELS[event] ?? event;

  return (
    <main style={{ maxWidth: '480px', margin: '0 auto', padding: '40px 24px', textAlign: 'center' }}>
      <a
        href="/add"
        style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--sage)', textDecoration: 'none', display: 'block', marginBottom: '32px', textAlign: 'left' }}
      >
        Back
      </a>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '16px' }}>
        PREPARE FOR SOMETHING
      </p>
      <h1 style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '36px', fontWeight: 400, color: 'var(--ink)', marginBottom: '16px' }}>
        {label}
      </h1>
      <div style={{ width: '40px', height: '1px', backgroundColor: 'var(--divider)', margin: '0 auto 20px' }} />
      <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '18px', color: 'var(--ink-faint)' }}>
        Coming soon.
      </p>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--ink-soft)', marginTop: '12px' }}>
        Use{' '}
        <a href="/tasks/new" style={{ color: 'var(--sage)' }}>Build something custom</a>
        {' '}to create a countdown ritual from a target date.
      </p>
    </main>
  );
}
