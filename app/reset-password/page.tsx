'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// Web password-reset landing page (Part B of the forgot-password flow).
// The mobile app triggers resetPasswordForEmail({ redirectTo: this page }); the
// user lands HERE from the email link, sets a new password, then signs in inside
// the app. HTTPS links are reliably tappable in mail clients (tendtoo:// often
// is not), which is why the reset happens on the web rather than via deep link.
//
// The recovery link can arrive in several shapes depending on the Supabase flow
// configured for the project / SDK that sent it:
//   - implicit:  #access_token=...&refresh_token=...&type=recovery   (hash)
//   - PKCE:      ?code=...                                           (query)
//   - OTP hash:  ?token_hash=...&type=recovery                       (query)
// The mobile client uses the implicit flow today, but we handle all three so the
// page keeps working regardless of project config. detectSessionInUrl is OFF so
// we control session establishment deterministically (no race with the SDK).

type Phase = 'verifying' | 'ready' | 'saving' | 'done' | 'error';

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
        { auth: { detectSessionInUrl: false } }
      ),
    []
  );

  const [phase, setPhase] = useState<Phase>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  // Establish the recovery session from whatever the email link carried.
  useEffect(() => {
    let cancelled = false;

    async function establish() {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''));

      // Supabase can redirect back with an explicit error (e.g. expired link).
      const linkError =
        url.searchParams.get('error_description') ?? hash.get('error_description');
      if (linkError) {
        if (!cancelled) {
          setErrorMsg(
            'This reset link has expired or has already been used — request a new one from the app.'
          );
          setPhase('error');
        }
        return;
      }

      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');
      const type = url.searchParams.get('type') ?? hash.get('type');

      let ok = false;
      try {
        if (accessToken && refreshToken) {
          // Implicit flow — tokens delivered in the URL hash.
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          ok = !error;
        } else if (code) {
          // PKCE flow.
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          ok = !error;
        } else if (tokenHash) {
          // OTP token-hash flow.
          const { error } = await supabase.auth.verifyOtp({
            type: (type as 'recovery') || 'recovery',
            token_hash: tokenHash,
          });
          ok = !error;
        } else {
          // Nothing in the URL — maybe a session is already present (e.g. reload).
          const { data } = await supabase.auth.getSession();
          ok = !!data.session;
        }
      } catch {
        ok = false;
      }

      if (cancelled) return;

      if (ok) {
        // Strip the token from the address bar so it isn't left in history.
        window.history.replaceState(null, '', '/reset-password');
        setPhase('ready');
      } else {
        setErrorMsg(
          'This reset link has expired or is invalid — request a new one from the app.'
        );
        setPhase('error');
      }
    }

    establish();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMsg(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setErrorMsg('Those passwords don’t match.');
      return;
    }

    setPhase('saving');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErrorMsg(error.message || 'Something went wrong. Please try again.');
      setPhase('ready');
      return;
    }
    setPhase('done');
  }

  return (
    <main style={pageStyle}>
      {/* Logo */}
      <div style={{ marginBottom: '40px', textAlign: 'center' }}>
        <div style={logoStyle}>
          tend<span style={{ color: '#6e8c82' }}>,</span> <em>too</em>
        </div>
        <p style={taglineStyle}>Because you&apos;re also on the list.</p>
      </div>

      {/* Card */}
      <div style={cardStyle}>
        {phase === 'verifying' && (
          <p style={infoStyle}>Checking your reset link…</p>
        )}

        {phase === 'error' && (
          <div style={{ textAlign: 'center' }}>
            <p style={headingStyle}>This link didn’t work</p>
            <p style={{ ...infoStyle, marginTop: '12px' }}>{errorMsg}</p>
          </div>
        )}

        {phase === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <p style={headingStyle}>Your password’s updated</p>
            <p style={{ ...infoStyle, marginTop: '12px', marginBottom: '24px' }}>
              Open the tend, too app and sign in with your new password.
            </p>
            <a href="tendtoo://" style={buttonLinkStyle}>
              Open tend, too
            </a>
          </div>
        )}

        {(phase === 'ready' || phase === 'saving') && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              <p style={headingStyle}>Set a new password</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={labelStyle}>New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                style={inputStyle}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={labelStyle}>Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter your new password"
                autoComplete="new-password"
                style={inputStyle}
                required
              />
            </div>

            {errorMsg && <p style={errorTextStyle}>{errorMsg}</p>}

            <button
              type="submit"
              disabled={phase === 'saving'}
              style={{
                ...submitStyle,
                backgroundColor: phase === 'saving' ? '#a8998e' : '#352720',
                cursor: phase === 'saving' ? 'default' : 'pointer',
              }}
            >
              {phase === 'saving' ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>

      <p style={footerStyle}>
        Didn’t request this? You can safely ignore it — nothing changes until a new
        password is set.
      </p>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#f3ecd9',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 24px',
  fontFamily: 'Inter, sans-serif',
};

const logoStyle: React.CSSProperties = {
  fontFamily: 'EB Garamond, Georgia, serif',
  fontSize: '48px',
  lineHeight: 1,
  color: '#352720',
  letterSpacing: '-0.025em',
};

const taglineStyle: React.CSSProperties = {
  marginTop: '12px',
  fontFamily: 'Inter, sans-serif',
  fontSize: '15px',
  color: '#6b5c52',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '480px',
  backgroundColor: '#faf4e6',
  borderRadius: '20px',
  border: '1px solid #ddd4c4',
  padding: '32px',
  boxShadow: '0 2px 20px rgba(53,39,32,0.06)',
};

const headingStyle: React.CSSProperties = {
  fontFamily: 'EB Garamond, Georgia, serif',
  fontSize: '24px',
  color: '#352720',
};

const infoStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#6b5c52',
  lineHeight: 1.6,
  textAlign: 'center',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif',
  fontSize: '13px',
  fontWeight: 500,
  color: '#352720',
  letterSpacing: '0.01em',
};

const inputStyle: React.CSSProperties = {
  backgroundColor: '#f3ecd9',
  border: '1px solid #ddd4c4',
  borderRadius: '10px',
  padding: '12px 14px',
  fontFamily: 'Inter, sans-serif',
  fontSize: '15px',
  color: '#352720',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const errorTextStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#c08a6e',
  margin: 0,
};

const submitStyle: React.CSSProperties = {
  color: '#f3ecd9',
  border: 'none',
  borderRadius: '100px',
  padding: '14px 24px',
  fontFamily: 'Inter, sans-serif',
  fontSize: '15px',
  fontWeight: 500,
  transition: 'background-color 0.15s ease',
  letterSpacing: '0.01em',
  marginTop: '4px',
};

const buttonLinkStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#352720',
  color: '#f3ecd9',
  border: 'none',
  borderRadius: '100px',
  padding: '14px 28px',
  fontFamily: 'Inter, sans-serif',
  fontSize: '15px',
  fontWeight: 500,
  letterSpacing: '0.01em',
  textDecoration: 'none',
};

const footerStyle: React.CSSProperties = {
  marginTop: '32px',
  fontSize: '12px',
  color: '#a8998e',
  textAlign: 'center',
  maxWidth: '420px',
  lineHeight: 1.6,
};
