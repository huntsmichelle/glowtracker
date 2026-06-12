'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Web account-deletion page (Part 3 — Google Play requires a web URL where a user can
// request account + data deletion WITHOUT the app). This is the functional version: the
// user signs in, confirms, and we call the SAME delete-account Edge Function the mobile
// app uses (single source of truth — verifies the JWT, wipes data, deletes the auth user).
// Styled to match /reset-password and /waitlist.

type Phase = 'signin' | 'confirm' | 'deleting' | 'done';

export default function DeleteAccountPage() {
  const supabase = useMemo(() => createClient(), []);

  const [phase, setPhase] = useState<Phase>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    if (!email.trim() || !password) {
      setErrorMsg('Enter your email and password.');
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setErrorMsg('That email and password didn’t match an account.');
      return;
    }
    setPhase('confirm');
  }

  async function handleDelete() {
    if (confirmText.trim().toUpperCase() !== 'DELETE') return;
    setErrorMsg('');
    setPhase('deleting');

    const { error } = await supabase.functions.invoke('delete-account');
    if (error) {
      setErrorMsg('Something went wrong. Please try again.');
      setPhase('confirm');
      return;
    }
    await supabase.auth.signOut();
    setPhase('done');
  }

  const canDelete = confirmText.trim().toUpperCase() === 'DELETE';

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
        {phase === 'signin' && (
          <form onSubmit={handleSignIn} style={formStyle}>
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              <p style={headingStyle}>Delete your account</p>
              <p style={{ ...infoStyle, marginTop: '10px' }}>
                Sign in to confirm it’s you. This permanently removes your account and all
                your data.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                style={inputStyle}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                style={inputStyle}
                required
              />
            </div>

            {errorMsg && <p style={errorTextStyle}>{errorMsg}</p>}

            <button type="submit" style={{ ...submitStyle, backgroundColor: '#352720' }}>
              Continue
            </button>
          </form>
        )}

        {(phase === 'confirm' || phase === 'deleting') && (
          <div style={formStyle}>
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              <p style={headingStyle}>This can’t be undone</p>
              <p style={{ ...infoStyle, marginTop: '10px' }}>
                Deleting your account permanently removes everything — all your rituals,
                routines, and history. There’s no way to recover it.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={labelStyle}>Type DELETE to confirm</label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                autoCapitalize="characters"
                autoComplete="off"
                style={inputStyle}
              />
            </div>

            {errorMsg && <p style={errorTextStyle}>{errorMsg}</p>}

            <button
              type="button"
              onClick={handleDelete}
              disabled={!canDelete || phase === 'deleting'}
              style={{
                ...submitStyle,
                backgroundColor: !canDelete || phase === 'deleting' ? '#a8998e' : '#c08a6e',
                cursor: !canDelete || phase === 'deleting' ? 'default' : 'pointer',
              }}
            >
              {phase === 'deleting' ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        )}

        {phase === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <p style={headingStyle}>Your account has been deleted</p>
            <p style={{ ...infoStyle, marginTop: '12px' }}>
              Your account and all associated data have been permanently removed. Thanks for
              giving tend, too a try.
            </p>
          </div>
        )}
      </div>

      <p style={footerStyle}>
        Don’t have the app? You can also email{' '}
        <a href="mailto:tendtooapp@gmail.com" style={{ color: '#6b5c52' }}>
          tendtooapp@gmail.com
        </a>{' '}
        to request deletion.
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

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
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
  cursor: 'pointer',
};

const footerStyle: React.CSSProperties = {
  marginTop: '32px',
  fontSize: '12px',
  color: '#a8998e',
  textAlign: 'center',
  maxWidth: '420px',
  lineHeight: 1.6,
};
