import { WaitlistForm } from './WaitlistForm';

export const metadata = {
  title: 'Join the waitlist — tend, too',
  description: 'Because you\'re also on the list.',
};

export default function WaitlistPage() {
  return (
    <main style={{
      minHeight: '100vh',
      backgroundColor: '#f3ecd9',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Logo */}
      <div style={{ marginBottom: '48px', textAlign: 'center' }}>
        <div style={{
          fontFamily: 'EB Garamond, Georgia, serif',
          fontSize: '48px',
          lineHeight: 1,
          color: '#352720',
          letterSpacing: '-0.025em',
        }}>
          tend<span style={{ color: '#6e8c82' }}>,</span>{' '}
          <em>too</em>
        </div>
        <p style={{
          marginTop: '12px',
          fontFamily: 'Inter, sans-serif',
          fontSize: '15px',
          color: '#6b5c52',
        }}>
          Because you&apos;re also on the list.
        </p>
      </div>

      {/* Form card */}
      <div style={{
        width: '100%',
        maxWidth: '480px',
        backgroundColor: '#faf4e6',
        borderRadius: '20px',
        border: '1px solid #ddd4c4',
        padding: '32px',
        boxShadow: '0 2px 20px rgba(53,39,32,0.06)',
      }}>
        <WaitlistForm />
      </div>

      {/* Footer */}
      <p style={{
        marginTop: '32px',
        fontSize: '12px',
        color: '#a8998e',
        textAlign: 'center',
      }}>
        We&apos;ll never share your information. Unsubscribe any time.
      </p>
    </main>
  );
}
