import Link from 'next/link';

export const metadata = {
  title: 'tend, too — Because you\'re also on the list.',
  description: 'A self-maintenance ritual tracker for the things you do for yourself.',
};

export default function OnboardingPage() {
  return (
    <main style={{
      minHeight: '100vh',
      backgroundColor: '#f3ecd9',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Logo */}
      <div style={{ marginBottom: '56px', textAlign: 'center' }}>
        <div style={{
          fontFamily: 'EB Garamond, Georgia, serif',
          fontSize: '52px',
          lineHeight: 1,
          color: '#352720',
          letterSpacing: '-0.025em',
        }}>
          tend<span style={{ color: '#6e8c82' }}>,</span>{' '}
          <em>too</em>
        </div>
        <p style={{
          marginTop: '14px',
          fontFamily: 'Inter, sans-serif',
          fontSize: '16px',
          color: '#6b5c52',
          letterSpacing: '0.01em',
        }}>
          Because you&apos;re also on the list.
        </p>
      </div>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: '480px',
        backgroundColor: '#faf4e6',
        borderRadius: '20px',
        border: '1px solid #ddd4c4',
        padding: '36px 32px',
        boxShadow: '0 2px 20px rgba(53,39,32,0.06)',
      }}>
        <p style={{
          fontFamily: 'EB Garamond, Georgia, serif',
          fontSize: '24px',
          fontWeight: 400,
          color: '#352720',
          lineHeight: 1.3,
          marginBottom: '16px',
        }}>
          The quiet app for the rituals you keep — and the ones you&apos;ve been meaning to.
        </p>

        <p style={{ fontSize: '15px', color: '#6b5c52', lineHeight: 1.7, marginBottom: '12px' }}>
          tend, too helps you track recurring beauty, grooming, and wellness rituals — hair appointments, skincare, nails, treatments — without the noise of a beauty influencer app.
        </p>

        <p style={{ fontSize: '15px', color: '#6b5c52', lineHeight: 1.7, marginBottom: '32px' }}>
          Schedule rituals around real life. Get gentle reminders. See what&apos;s coming up. Keep track of what you use.
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Link
            href="/signup"
            style={{
              backgroundColor: '#352720',
              color: '#f3ecd9',
              border: 'none',
              borderRadius: '100px',
              padding: '14px 24px',
              fontFamily: 'Inter, sans-serif',
              fontSize: '15px',
              fontWeight: 500,
              cursor: 'pointer',
              textDecoration: 'none',
              textAlign: 'center',
              display: 'block',
              letterSpacing: '0.01em',
            }}
          >
            Create an account
          </Link>
          <Link
            href="/login"
            style={{
              backgroundColor: 'transparent',
              color: '#6b5c52',
              border: '1px solid #ddd4c4',
              borderRadius: '100px',
              padding: '13px 24px',
              fontFamily: 'Inter, sans-serif',
              fontSize: '15px',
              fontWeight: 400,
              cursor: 'pointer',
              textDecoration: 'none',
              textAlign: 'center',
              display: 'block',
            }}
          >
            Sign in
          </Link>
        </div>
      </div>

      {/* Footer */}
      <p style={{
        marginTop: '32px',
        fontSize: '12px',
        color: '#a8998e',
        textAlign: 'center',
      }}>
        <Link href="/waitlist" style={{ color: '#a8998e' }}>Join the waitlist</Link>
        {' · '}
        <Link href="/login" style={{ color: '#a8998e' }}>Already have an account</Link>
      </p>
    </main>
  );
}
