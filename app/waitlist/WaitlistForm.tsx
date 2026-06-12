'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const MANAGING_OPTIONS = [
  { value: 'hair',       label: 'Hair' },
  { value: 'skin',       label: 'Skin' },
  { value: 'nails',      label: 'Nails' },
  { value: 'makeup',     label: 'Makeup' },
  { value: 'event_prep', label: 'Event prep' },
  { value: 'multiple',   label: 'Multiple / all of the above' },
];

const PLATFORM_OPTIONS = [
  { value: 'ios',     label: 'iPhone' },
  { value: 'android', label: 'Android' },
  { value: 'unsure',  label: 'Not sure' },
];

function WaitlistFormInner() {
  const searchParams = useSearchParams();
  const source = searchParams.get('source') ?? 'direct';

  const [firstName, setFirstName] = useState('');
  const [email, setEmail]         = useState('');
  const [managing, setManaging]   = useState<string[]>([]);
  const [platform, setPlatform]   = useState('');
  const [interestedInBeta, setInterestedInBeta] = useState(false);
  const [updates, setUpdates]     = useState(false);
  const [status, setStatus]       = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg]   = useState('');

  function toggleManaging(value: string) {
    setManaging(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !email.trim() || managing.length === 0 || !platform) {
      setErrorMsg('Please fill in all required fields, select at least one category, and choose your phone.');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, email, managing, platform, interestedInBeta, updates, source }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Something went wrong.');
        setStatus('error');
        return;
      }

      setStatus('success');
    } catch {
      setErrorMsg('Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <p style={{
          fontFamily: 'EB Garamond, Georgia, serif',
          fontStyle: 'italic',
          fontSize: '24px',
          color: '#352720',
          marginBottom: '12px',
        }}>
          You&apos;re on the list.
        </p>
        <p style={{ fontSize: '14px', color: '#6b5c52', lineHeight: 1.6 }}>
          We&apos;ll be in touch as we get closer to launch.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* First name */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={labelStyle}>
          First name <span style={{ color: '#c08a6e' }}>*</span>
        </label>
        <input
          type="text"
          value={firstName}
          onChange={e => setFirstName(e.target.value)}
          placeholder="Your first name"
          style={inputStyle}
          required
        />
      </div>

      {/* Email */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={labelStyle}>
          Email <span style={{ color: '#c08a6e' }}>*</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={inputStyle}
          required
        />
      </div>

      {/* Managing */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={labelStyle}>
          What are you looking to manage? <span style={{ color: '#c08a6e' }}>*</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {MANAGING_OPTIONS.map(opt => {
            const selected = managing.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleManaging(opt.value)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '100px',
                  border: `1px solid ${selected ? '#6e8c82' : '#ddd4c4'}`,
                  backgroundColor: selected ? 'rgba(110,140,130,0.12)' : 'transparent',
                  color: selected ? '#6e8c82' : '#6b5c52',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '13px',
                  fontWeight: selected ? 500 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Platform */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={labelStyle}>
          Which phone do you use? <span style={{ color: '#c08a6e' }}>*</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {PLATFORM_OPTIONS.map(opt => {
            const selected = platform === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPlatform(opt.value)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '100px',
                  border: `1px solid ${selected ? '#6e8c82' : '#ddd4c4'}`,
                  backgroundColor: selected ? 'rgba(110,140,130,0.12)' : 'transparent',
                  color: selected ? '#6e8c82' : '#6b5c52',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '13px',
                  fontWeight: selected ? 500 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Beta interest */}
      <label style={checkboxRowStyle}>
        <input
          type="checkbox"
          checked={interestedInBeta}
          onChange={e => setInterestedInBeta(e.target.checked)}
          style={{ accentColor: '#6e8c82', width: '16px', height: '16px', flexShrink: 0, marginTop: '2px' }}
        />
        <span style={{ fontSize: '14px', color: '#352720', lineHeight: 1.4 }}>
          I&apos;d be interested in beta testing
        </span>
      </label>

      {/* Updates */}
      <label style={checkboxRowStyle}>
        <input
          type="checkbox"
          checked={updates}
          onChange={e => setUpdates(e.target.checked)}
          style={{ accentColor: '#6e8c82', width: '16px', height: '16px', flexShrink: 0, marginTop: '2px' }}
        />
        <span style={{ fontSize: '14px', color: '#352720', lineHeight: 1.4 }}>
          Send me occasional updates about development and early access
        </span>
      </label>

      {/* Error */}
      {errorMsg && (
        <p style={{ fontSize: '13px', color: '#c08a6e', margin: 0 }}>{errorMsg}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={status === 'loading'}
        style={{
          backgroundColor: status === 'loading' ? '#a8998e' : '#352720',
          color: '#f3ecd9',
          border: 'none',
          borderRadius: '100px',
          padding: '14px 24px',
          fontFamily: 'Inter, sans-serif',
          fontSize: '15px',
          fontWeight: 500,
          cursor: status === 'loading' ? 'default' : 'pointer',
          transition: 'background-color 0.15s ease',
          letterSpacing: '0.01em',
          marginTop: '4px',
        }}
      >
        {status === 'loading' ? 'Joining…' : 'Join the waitlist'}
      </button>
    </form>
  );
}

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

const checkboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  cursor: 'pointer',
};

export function WaitlistForm() {
  return (
    <Suspense fallback={<div style={{ height: '200px' }} />}>
      <WaitlistFormInner />
    </Suspense>
  );
}
