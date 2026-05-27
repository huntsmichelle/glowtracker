'use client';

import { useEffect } from 'react';

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-2xl mx-auto px-5 py-16 flex flex-col items-center gap-4">
      <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#2b2823' }}>
        Something went wrong.
      </p>
      <div style={{ width: '40px', height: '1px', backgroundColor: '#cdc6b6' }} />
      <p style={{ fontSize: '13px', color: '#6b665e', textAlign: 'center' }}>
        An unexpected error occurred. Try refreshing the page.
      </p>
      <button
        type="button"
        onClick={unstable_retry}
        style={{
          border: '1px solid #2b2823',
          backgroundColor: 'transparent',
          color: '#2b2823',
          fontSize: '13px',
          fontWeight: 500,
          borderRadius: '100px',
          padding: '7px 20px',
          cursor: 'pointer',
          marginTop: '8px',
        }}
      >
        Try again
      </button>
    </div>
  );
}
