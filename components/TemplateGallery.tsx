'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface TemplateItem {
  id: string;
  name: string;
  template_description: string | null;
  template_task_count: number | null;
  template_category: string | null;
  color: string;
}

interface Props {
  templates: TemplateItem[];
  userId: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Hair Care': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
    </svg>
  ),
  'Skincare': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>
    </svg>
  ),
  'Nails': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12l3.5 9H2.5z"/><path d="M3 14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1H3z"/><path d="M7 20h10"/><path d="M9 20v-4"/><path d="M15 20v-4"/>
    </svg>
  ),
  'Brows & Lashes': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  'Body': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  'Hair Removal': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
};

function FallbackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
    </svg>
  );
}

export default function TemplateGallery({ templates }: Props) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Group by category
  const categoryMap = new Map<string, TemplateItem[]>();
  for (const t of templates) {
    const cat = t.template_category ?? 'Other';
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat)!.push(t);
  }
  const categories = [...categoryMap.keys()];
  const overlayTemplates = activeCategory ? (categoryMap.get(activeCategory) ?? []) : [];

  if (templates.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <p className="label-overline mb-0.5">Inspiration</p>
        <p style={{ fontSize: '13px', color: '#6b665e' }}>Curated starting points.</p>
      </div>

      {/* 2-column category tile grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {categories.map(cat => {
          const items = categoryMap.get(cat)!;
          const Icon = CATEGORY_ICONS[cat] ? () => CATEGORY_ICONS[cat] : FallbackIcon;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              style={{
                backgroundColor: '#f6f1e6',
                border: '1px solid #cdc6b6',
                borderRadius: '16px',
                padding: '20px 16px 16px',
                textAlign: 'left',
                cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(43,40,35,0.06)',
                transition: 'box-shadow 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 3px 10px rgba(43,40,35,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(43,40,35,0.06)'; }}
            >
              <span style={{ color: '#6b665e', display: 'block', marginBottom: '24px' }}>
                <Icon />
              </span>
              <p style={{ fontSize: '17px', fontWeight: 500, color: '#2b2823', lineHeight: 1.2, marginBottom: '4px' }}>{cat}</p>
              <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297' }}>
                {items.length} Template{items.length !== 1 ? 's' : ''}
              </p>
            </button>
          );
        })}
      </div>

      {/* Category overlay */}
      {activeCategory && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(43,40,35,0.3)',
            backdropFilter: 'blur(4px)',
            padding: '24px',
          }}
          onClick={e => { if (e.target === e.currentTarget) setActiveCategory(null); }}
        >
          <div
            style={{
              backgroundColor: '#f6f1e6',
              border: '1px solid #cdc6b6',
              borderRadius: '16px',
              boxShadow: '0 12px 40px rgba(43,40,35,0.2)',
              width: '100%',
              maxWidth: '480px',
              maxHeight: '70vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 16px', borderBottom: '1px solid #cdc6b6', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: '#6b665e' }}>
                  {CATEGORY_ICONS[activeCategory] ?? <FallbackIcon />}
                </span>
                <p style={{ fontSize: '17px', fontWeight: 500, color: '#2b2823' }}>{activeCategory} Templates</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a297', fontSize: '20px', lineHeight: 1, padding: '4px' }}
              >
                ✕
              </button>
            </div>

            {/* Template list */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {overlayTemplates.map((t, i) => (
                <div
                  key={t.id}
                  style={{
                    padding: '16px 20px',
                    borderBottom: i < overlayTemplates.length - 1 ? '1px solid #cdc6b6' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '17px', color: '#2b2823', fontWeight: 400, lineHeight: 1.2, marginBottom: '3px' }}>{t.name}</p>
                    {t.template_description && (
                      <p style={{ fontSize: '13px', color: '#6b665e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '260px' }}>{t.template_description}</p>
                    )}
                    <p style={{ fontSize: '12px', color: '#a8a297', marginTop: '4px' }}>
                      {t.template_task_count ?? '—'} ritual{t.template_task_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/routines/new/from-template/${t.id}`)}
                    style={{
                      flexShrink: 0,
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#2b2823',
                      border: '1px solid #2b2823',
                      backgroundColor: 'transparent',
                      borderRadius: '100px',
                      padding: '5px 14px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Use template
                  </button>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid #cdc6b6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#6b665e' }}
              >
                ← Back
              </button>
              <a
                href="/routines/templates"
                style={{ fontSize: '13px', color: '#6b665e', textDecoration: 'none' }}
              >
                Browse full library →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
