'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { restockProduct, usesRemainingFull } from '@/lib/productTracking';
import { getCategoryColor } from '@/lib/categoryColors';
import DepletionBar from '@/components/DepletionBar';
import type { Product, ProductCategory } from '@/types';

interface Props {
  userProducts: Product[];
  systemProducts: Product[];
  categories: ProductCategory[];
  userId: string;
}

// ── Helpers ─────────────────────────────────────────────────────

function getDescendantIds(cat: ProductCategory, allCats: ProductCategory[]): string[] {
  const ids: string[] = [cat.id];
  for (const child of allCats.filter(c => c.parent_id === cat.id)) {
    ids.push(...getDescendantIds(child, allCats));
  }
  return ids;
}

function pctRemaining(product: Product): number | null {
  if (product.remaining_amount == null || !product.container_size || product.container_size <= 0) return null;
  return Math.min(1, Math.max(0, product.remaining_amount / product.container_size));
}

function barColor(pct: number): string {
  if (pct > 0.5) return '#2b2823';
  if (pct > 0.2) return '#d4a478';  // apricot
  return '#c08a6e';                   // refresh
}

function expiryStatus(product: Product): 'expired' | 'soon' | null {
  if (!product.expires_at) return null;
  const exp = new Date(product.expires_at);
  const now = new Date();
  const diffDays = Math.floor((exp.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'soon';
  return null;
}

function formatExpiry(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function getCategoryChain(catId: string | null, cats: ProductCategory[]): { top: string; sub: string | null; dotColor: string } | null {
  if (!catId) return null;
  const cat = cats.find(c => c.id === catId);
  if (!cat) return null;
  if (cat.parent_id) {
    const parent = cats.find(c => c.id === cat.parent_id);
    const topName = parent?.name ?? '';
    return { top: topName, sub: cat.name, dotColor: getCategoryColor(topName).dot };
  }
  return { top: cat.name, sub: null, dotColor: getCategoryColor(cat.name).dot };
}

// ── Restock Modal ────────────────────────────────────────────────

function RestockModal({ product, onClose, onRestocked }: {
  product: Product;
  onClose: () => void;
  onRestocked: (id: string) => void;
}) {
  const [size, setSize] = useState(product.container_size != null ? String(product.container_size) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRestock() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await restockProduct(supabase, product.id, product.user_id, size !== '' ? Number(size) : undefined);
    if (err) { setError(err); setSaving(false); return; }
    onRestocked(product.id);
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(43,40,35,0.35)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#f6f1e6', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '360px', boxShadow: '0 8px 32px rgba(43,40,35,0.14)' }}>
        <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '20px', color: '#2b2823', marginBottom: '16px' }}>
          Restock — {product.name}
        </p>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>
            Container size {product.container_unit ? `(${product.container_unit})` : ''}
          </label>
          <input type="number" min={0} value={size} onChange={e => setSize(e.target.value)}
            placeholder={product.container_size != null ? String(product.container_size) : 'e.g. 150'}
            style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#efe9dd', color: '#2b2823' }} />
        </div>
        {error && <p style={{ fontSize: '12px', color: '#c08a6e', marginBottom: '12px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, border: '1px solid #2b2823', background: 'transparent', color: '#2b2823', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '8px 16px', cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={handleRestock} disabled={saving}
            style={{ flex: 1, background: '#2b2823', color: '#efe9dd', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '8px 16px', cursor: 'pointer', border: 'none', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Restocking…' : 'Mark restocked'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Product Modal ────────────────────────────────────────────

function AddProductModal({ systemProducts, categories, userId, onClose, onAdded }: {
  systemProducts: Product[];
  categories: ProductCategory[];
  userId: string;
  onClose: () => void;
  onAdded: (p: Product) => void;
}) {
  const [topCatId, setTopCatId] = useState('');
  const [subCatId, setSubCatId] = useState('');
  const [leafCatId, setLeafCatId] = useState('');
  const [name, setName] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [brand, setBrand] = useState('');
  const [notes, setNotes] = useState('');
  const [containerSize, setContainerSize] = useState('');
  const [containerUnit, setContainerUnit] = useState('oz');
  const [amountPerUse, setAmountPerUse] = useState('');
  const [usesPerContainer, setUsesPerContainer] = useState('');
  const [highlightCalc, setHighlightCalc] = useState(false);
  const [reorderUrl, setReorderUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topCats = categories.filter(c => !c.parent_id);
  const subCats = topCatId ? categories.filter(c => c.parent_id === topCatId) : [];
  const leafCats = subCatId ? categories.filter(c => c.parent_id === subCatId) : [];
  const finalCatId = leafCatId || subCatId || topCatId || null;

  // Show name suggestions when category fully resolved and user hasn't typed much
  const suggestCatId = leafCatId || (leafCats.length === 0 && subCatId) || null;
  const suggestions = suggestCatId && name.length < 3
    ? systemProducts.filter(p => p.product_category_id === suggestCatId).slice(0, 5)
    : [];

  function recalc(sizeStr: string, perUseStr: string) {
    const size = parseFloat(sizeStr);
    const perUse = parseFloat(perUseStr);
    if (size > 0 && perUse > 0) {
      setUsesPerContainer(String(Math.floor(size / perUse)));
      setHighlightCalc(true);
      setTimeout(() => setHighlightCalc(false), 1000);
    }
  }

  function prefillFromSuggestion(p: Product) {
    setName(p.name);
    setBrand(p.brand ?? '');
    if (p.container_size != null) setContainerSize(String(p.container_size));
    if (p.container_unit) setContainerUnit(p.container_unit);
    const perUse = (p.uses_per_supply_unit && p.container_size && p.uses_per_supply_unit > 0)
      ? String(p.container_size / p.uses_per_supply_unit)
      : '';
    setAmountPerUse(perUse);
    recalc(p.container_size != null ? String(p.container_size) : '', perUse);
  }

  async function handleSave() {
    if (!name.trim()) { setError('Product name is required.'); return; }
    const trimmedReorder = reorderUrl.trim();
    if (trimmedReorder && !trimmedReorder.startsWith('http://') && !trimmedReorder.startsWith('https://')) {
      setError('Reorder link must start with http:// or https://');
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const totalSize = containerSize !== '' ? Number(containerSize) : null;
    const perUse = amountPerUse !== '' ? Number(amountPerUse) : null;
    const usesPerCont = totalSize && perUse && perUse > 0 ? Math.floor(totalSize / perUse) : null;
    const { data, error: err } = await supabase.from('products').insert({
      user_id: userId,
      name: name.trim(),
      brand: brand.trim() || null,
      notes: notes.trim() || null,
      reorder_url: trimmedReorder || null,
      product_category_id: finalCatId,
      container_size: totalSize,
      container_unit: containerUnit || null,
      uses_per_supply_unit: usesPerCont,
      remaining_amount: totalSize,
      is_depleted: false,
      expires_at: expiresAt ? expiresAt + '-01' : null,
    }).select().single();
    if (err || !data) { setError(err?.message ?? 'Could not save product.'); setSaving(false); return; }
    onAdded(data as Product);
    onClose();
  }

  const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#ede8db', color: '#2b2823' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' };
  const pillBase: React.CSSProperties = { fontSize: '11px', borderRadius: '100px', border: '1px solid', padding: '4px 12px', cursor: 'pointer', background: 'none' };

  function PillRow({ items, selected, onSelect }: { items: ProductCategory[]; selected: string; onSelect: (id: string) => void }) {
    return (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {items.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(selected === c.id ? '' : c.id)}
            style={{
              ...pillBase,
              borderColor: selected === c.id ? '#2b2823' : '#cdc6b6',
              background: selected === c.id ? '#2b2823' : 'transparent',
              color: selected === c.id ? '#efe9dd' : '#6b665e',
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(43,40,35,0.35)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#f6f1e6', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 8px 32px rgba(43,40,35,0.14)', display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px', marginBottom: '40px' }}>
        <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#2b2823' }}>Add product</p>

        {/* Category pills */}
        {topCats.length > 0 && (
          <div>
            <label style={labelStyle}>Category</label>
            <PillRow items={topCats} selected={topCatId} onSelect={id => { setTopCatId(id); setSubCatId(''); setLeafCatId(''); }} />
          </div>
        )}

        {/* Subcategory pills */}
        {subCats.length > 0 && (
          <div>
            <label style={labelStyle}>Subcategory</label>
            <PillRow items={subCats} selected={subCatId} onSelect={id => { setSubCatId(id); setLeafCatId(''); }} />
          </div>
        )}

        {/* Product type pills */}
        {leafCats.length > 0 && (
          <div>
            <label style={labelStyle}>Product type</label>
            <PillRow items={leafCats} selected={leafCatId} onSelect={id => setLeafCatId(id)} />
          </div>
        )}

        {/* Product name + optional suggestions */}
        <div>
          <label style={labelStyle}>Product name *</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setTimeout(() => setNameFocused(false), 200)}
              placeholder="e.g. Revlon ColorSilk"
              style={inputStyle}
            />
            {nameFocused && suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#f6f1e6', border: '1px solid #cdc6b6', borderRadius: '8px', zIndex: 10, boxShadow: '0 4px 12px rgba(43,40,35,0.1)', marginTop: '4px', overflow: 'hidden' }}>
                {suggestions.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={() => prefillFromSuggestion(s)}
                    style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: '13px', color: '#2b2823', background: 'none', border: 'none', borderBottom: '1px solid #e8e2d5', cursor: 'pointer' }}
                  >
                    {s.name}{s.brand ? ` · ${s.brand}` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Brand */}
        <div>
          <label style={labelStyle}>Brand (optional)</label>
          <input type="text" value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Revlon" style={inputStyle} />
        </div>

        {/* Total size + Amount per use */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Total size</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="number"
                min={0}
                value={containerSize}
                onChange={e => setContainerSize(e.target.value)}
                onBlur={() => recalc(containerSize, amountPerUse)}
                placeholder="e.g. 32"
                style={{ flex: 1, border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 10px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }}
              />
              <select
                value={containerUnit}
                onChange={e => setContainerUnit(e.target.value)}
                style={{ width: '64px', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 6px', fontSize: '12px', background: '#ede8db', color: '#2b2823' }}
              >
                {['oz', 'fl oz', 'ml', 'g'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Amount per use</label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="number"
                min={0}
                value={amountPerUse}
                onChange={e => setAmountPerUse(e.target.value)}
                onBlur={() => recalc(containerSize, amountPerUse)}
                placeholder="e.g. 2"
                style={{ flex: 1, border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 10px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }}
              />
              <span style={{ fontSize: '12px', color: '#a8a297', whiteSpace: 'nowrap', minWidth: '48px' }}>{containerUnit} / use</span>
            </div>
          </div>
        </div>

        {/* Uses per container — read-only calculated */}
        <p style={{ fontSize: '12px', color: '#a8a297', marginTop: '-8px', borderRadius: '6px', padding: '4px 8px', border: highlightCalc ? '1px solid rgba(142,163,148,0.5)' : '1px solid transparent', background: highlightCalc ? 'rgba(142,163,148,0.08)' : 'transparent', transition: 'border-color 0.3s, background 0.3s', visibility: usesPerContainer ? 'visible' : 'hidden' }}>
          ≈ {usesPerContainer || '—'} uses per container
        </p>

        {/* Purchase price */}
        <div>
          <label style={labelStyle}>Purchase price (optional)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #cdc6b6', borderRadius: '8px', background: '#ede8db', padding: '8px 12px' }}>
            <span style={{ fontSize: '13px', color: '#6b665e', flexShrink: 0 }}>$</span>
            <input type="number" min={0} step="0.01" placeholder="0.00"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: '#2b2823' }} />
          </div>
        </div>

        {/* Reorder link */}
        <div>
          <label style={labelStyle}>Reorder link (optional)</label>
          <input type="url" value={reorderUrl} onChange={e => setReorderUrl(e.target.value)}
            placeholder="https://…" style={inputStyle} />
        </div>

        {/* Expiration */}
        <div>
          <label style={labelStyle}>Expiration (optional)</label>
          <input type="month" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={inputStyle} />
        </div>

        {/* Notes */}
        <div>
          <label style={labelStyle}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. works best on damp hair"
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.4 }}
          />
        </div>

        {error && <p style={{ fontSize: '12px', color: '#c08a6e' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, border: '1px solid #2b2823', background: 'transparent', color: '#2b2823', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '9px 16px', cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            style={{ flex: 1, background: '#2b2823', color: '#efe9dd', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '9px 16px', cursor: 'pointer', border: 'none', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Adding…' : 'Add to shelf'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Product Detail Slide-Over ────────────────────────────────────

function ProductSlideOver({ product, categories, onClose, onUpdated, onRestock }: {
  product: Product;
  categories: ProductCategory[];
  onClose: () => void;
  onUpdated: (p: Product) => void;
  onRestock: (p: Product) => void;
}) {
  const [name, setName] = useState(product.name);
  const [brand, setBrand] = useState(product.brand ?? '');
  const [productUrl, setProductUrl] = useState(product.product_url ?? '');
  const [reorderUrl, setReorderUrl] = useState(product.reorder_url ?? '');
  const [containerSize, setContainerSize] = useState(product.container_size != null ? String(product.container_size) : '');
  const [containerUnit, setContainerUnit] = useState(product.container_unit ?? 'oz');
  const [amountPerUse, setAmountPerUse] = useState(() => {
    if (product.container_size && product.uses_per_supply_unit && product.uses_per_supply_unit > 0) {
      return String(product.container_size / product.uses_per_supply_unit);
    }
    return '';
  });
  const [usesPerContainerCalc, setUsesPerContainerCalc] = useState(() =>
    product.uses_per_supply_unit ? String(product.uses_per_supply_unit) : ''
  );
  const [highlightCalc, setHighlightCalc] = useState(false);
  const [remaining, setRemaining] = useState(product.remaining_amount != null ? String(product.remaining_amount) : '');
  const [expiresAt, setExpiresAt] = useState(product.expires_at ? product.expires_at.slice(0, 7) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedTasks, setLinkedTasks] = useState<{ id: string; name: string; useAmount: number | null }[]>([]);

  const topLevelCats = categories.filter(c => !c.parent_id);
  const selectedCatObj = categories.find(c => c.id === product.product_category_id);
  const [topCatId, setTopCatId] = useState(selectedCatObj?.parent_id ?? (selectedCatObj?.id ?? ''));
  const [categoryId, setCategoryId] = useState(selectedCatObj?.parent_id ? product.product_category_id ?? '' : '');
  const subCats = topCatId ? categories.filter(c => c.parent_id === topCatId) : [];

  const pct = pctRemaining(product);
  const expiry = expiryStatus(product);

  const defaultPerUse = (product.container_size && product.uses_per_supply_unit && product.uses_per_supply_unit > 0)
    ? product.container_size / product.uses_per_supply_unit
    : null;

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('task_products')
      .select('use_amount_override, task:tasks(id, name)')
      .eq('product_id', product.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => {
        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setLinkedTasks((data as any[]).map(tp => ({
            id: tp.task?.id ?? '',
            name: tp.task?.name ?? '—',
            useAmount: tp.use_amount_override,
          })));
        }
      });
  }, [product.id]);

  function recalc(sizeStr: string, perUseStr: string) {
    const size = parseFloat(sizeStr);
    const perUse = parseFloat(perUseStr);
    if (size > 0 && perUse > 0) {
      setUsesPerContainerCalc(String(Math.floor(size / perUse)));
      setHighlightCalc(true);
      setTimeout(() => setHighlightCalc(false), 1000);
    }
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return; }
    const trimmedReorder = reorderUrl.trim();
    if (trimmedReorder && !trimmedReorder.startsWith('http://') && !trimmedReorder.startsWith('https://')) {
      setError('Reorder link must start with http:// or https://');
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const finalCatId = categoryId || topCatId || null;
    const totalSizeNum = containerSize !== '' ? Number(containerSize) : null;
    const perUseNum = amountPerUse !== '' ? Number(amountPerUse) : null;
    const usesPerCont = totalSizeNum && perUseNum && perUseNum > 0 ? Math.floor(totalSizeNum / perUseNum) : null;
    // One-time correction: if remaining was never set but total size is known, start full
    const resolvedRemaining = (remaining === '' && totalSizeNum !== null)
      ? totalSizeNum
      : (remaining !== '' ? Number(remaining) : null);
    const { data, error: err } = await supabase.from('products').update({
      name: name.trim(),
      brand: brand.trim() || null,
      product_url: productUrl.trim() || null,
      reorder_url: trimmedReorder || null,
      product_category_id: finalCatId,
      container_size: totalSizeNum,
      container_unit: containerUnit || null,
      uses_per_supply_unit: usesPerCont,
      remaining_amount: resolvedRemaining,
      is_depleted: resolvedRemaining !== null && resolvedRemaining <= 0,
      expires_at: expiresAt ? expiresAt + '-01' : null,
    }).eq('id', product.id).eq('user_id', product.user_id).select().single();
    if (err || !data) { setError(err?.message ?? 'Could not save.'); setSaving(false); return; }
    onUpdated(data as Product);
    onClose();
  }

  const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#ede8db', color: '#2b2823' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' };
  const subLabelStyle: React.CSSProperties = { fontSize: '10px', color: '#a8a297', marginBottom: '4px' };

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(43,40,35,0.25)', zIndex: 40 }} onClick={onClose} />
      {/* Panel */}
      <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 'min(480px, 90vw)', background: '#f6f1e6', zIndex: 50, boxShadow: '-4px 0 24px rgba(43,40,35,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Header — sticky */}
        <div style={{ position: 'sticky', top: 0, padding: '20px 24px 16px', borderBottom: '1px solid #cdc6b6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: '#f6f1e6', zIndex: 1 }}>
          <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '20px', color: '#2b2823' }}>{product.name}</p>
          <button type="button" onClick={onClose} style={{ fontSize: '20px', color: '#a8a297', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Status summary */}
        {pct != null && product.container_size != null && (
          <div style={{ padding: '16px 24px 0' }}>
            <DepletionBar
              remainingAmount={product.remaining_amount ?? 0}
              totalAmount={product.container_size}
              usesDisplay={usesRemainingFull(product)}
            />
            {(expiry === 'expired' || expiry === 'soon') && product.expires_at && (
              <div style={{ marginTop: '6px' }}>
                <span style={{ fontSize: '11px', background: 'rgba(192,138,110,0.12)', color: '#c08a6e', borderRadius: '100px', padding: '2px 8px', fontWeight: expiry === 'expired' ? 500 : 400 }}>
                  {expiry === 'expired' ? 'Expired' : `Expires ${formatExpiry(product.expires_at)}`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Restock button if needed */}
        {(product.is_depleted || (pct != null && pct < 0.2)) && (
          <div style={{ padding: '12px 24px 0' }}>
            <button type="button" onClick={() => { onClose(); onRestock(product); }}
              style={{ border: '1px solid #2b2823', background: 'transparent', color: '#2b2823', fontSize: '12px', fontWeight: 500, borderRadius: '100px', padding: '5px 14px', cursor: 'pointer' }}>
              Restock
            </button>
          </div>
        )}

        {/* Edit form */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
          {/* Name */}
          <div>
            <label style={labelStyle}>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
          </div>

          {/* Brand */}
          <div>
            <label style={labelStyle}>Brand</label>
            <input type="text" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Optional" style={inputStyle} />
          </div>

          {/* Category picker */}
          {topLevelCats.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={labelStyle}>Category</label>
                <select value={topCatId} onChange={e => { setTopCatId(e.target.value); setCategoryId(''); }}
                  style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px', fontSize: '13px', background: '#ede8db', color: '#2b2823' }}>
                  <option value="">Select…</option>
                  {topLevelCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {subCats.length > 0 && (
                <div>
                  <label style={labelStyle}>Subcategory</label>
                  <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                    style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px', fontSize: '13px', background: '#ede8db', color: '#2b2823' }}>
                    <option value="">Select…</option>
                    {subCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Quantity fields */}
          <div>
            <label style={labelStyle}>Quantity</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'end' }}>
              <div>
                <p style={subLabelStyle}>Total size</p>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    type="number" min={0}
                    value={containerSize}
                    onChange={e => setContainerSize(e.target.value)}
                    onBlur={() => recalc(containerSize, amountPerUse)}
                    placeholder="e.g. 32"
                    style={{ flex: 1, border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 10px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }}
                  />
                  <select
                    value={containerUnit}
                    onChange={e => setContainerUnit(e.target.value)}
                    style={{ width: '60px', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '6px', fontSize: '12px', background: '#ede8db', color: '#2b2823' }}
                  >
                    {['oz', 'fl oz', 'ml', 'g', 'kit', 'strips'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <p style={subLabelStyle}>Amount per use</p>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    type="number" min={0}
                    value={amountPerUse}
                    onChange={e => setAmountPerUse(e.target.value)}
                    onBlur={() => recalc(containerSize, amountPerUse)}
                    placeholder="e.g. 2"
                    style={{ flex: 1, border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 10px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }}
                  />
                  <span style={{ fontSize: '12px', color: '#a8a297', whiteSpace: 'nowrap' }}>{containerUnit} / use</span>
                </div>
              </div>
            </div>
            {/* Uses per container — read-only */}
            <p style={{ fontSize: '12px', color: '#a8a297', marginTop: '6px', borderRadius: '6px', padding: '4px 8px', border: highlightCalc ? '1px solid rgba(142,163,148,0.5)' : '1px solid transparent', background: highlightCalc ? 'rgba(142,163,148,0.08)' : 'transparent', transition: 'border-color 0.3s, background 0.3s', visibility: usesPerContainerCalc ? 'visible' : 'hidden' }}>
              ≈ {usesPerContainerCalc || '—'} uses per container
            </p>
            {/* Remaining */}
            <div style={{ marginTop: '12px' }}>
              <p style={subLabelStyle}>Remaining (adjust for mid-bottle)</p>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="number" min={0}
                  value={remaining}
                  onChange={e => setRemaining(e.target.value)}
                  placeholder={containerSize || 'e.g. 16'}
                  style={{ flex: 1, border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 10px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }}
                />
                {containerUnit && <span style={{ fontSize: '12px', color: '#a8a297', whiteSpace: 'nowrap' }}>{containerUnit}</span>}
              </div>
            </div>
          </div>

          {/* Expiration */}
          <div>
            <label style={labelStyle}>Expiration (optional)</label>
            <input type="month" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={inputStyle} />
          </div>

          {/* Product URL */}
          <div>
            <label style={labelStyle}>Product URL</label>
            <input type="text" value={productUrl} onChange={e => setProductUrl(e.target.value)} placeholder="https://…" style={inputStyle} />
          </div>

          {/* Reorder link */}
          <div>
            <label style={labelStyle}>Reorder link (optional)</label>
            <input type="url" value={reorderUrl} onChange={e => setReorderUrl(e.target.value)}
              placeholder="Paste a link to reorder this product" style={inputStyle} />
          </div>

          {error && <p style={{ fontSize: '12px', color: '#c08a6e' }}>{error}</p>}

          {/* Used in rituals */}
          <div style={{ borderTop: '1px solid #e8e2d5', paddingTop: '16px', marginTop: '4px' }}>
            <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '10px' }}>Used in rituals</p>
            {linkedTasks.filter(t => t.id).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {linkedTasks.filter(t => t.id).map(t => {
                  const effectiveAmount = t.useAmount ?? defaultPerUse;
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', color: '#2b2823', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                      <span style={{ fontSize: '12px', color: '#a8a297', flexShrink: 0 }}>
                        {effectiveAmount != null ? `${effectiveAmount} ${containerUnit} / ritual` : '—'}
                      </span>
                      <a
                        href={`/tasks/${t.id}/edit`}
                        style={{ fontSize: '12px', color: '#6b665e', flexShrink: 0, textDecoration: 'none', whiteSpace: 'nowrap' }}
                      >
                        Edit ›
                      </a>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: '#a8a297', fontStyle: 'italic' }}>Not linked to any rituals yet.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #cdc6b6', flexShrink: 0, background: '#f6f1e6' }}>
          <button type="button" onClick={handleSave} disabled={saving}
            style={{ width: '100%', background: '#2b2823', color: '#efe9dd', fontSize: '14px', fontWeight: 500, borderRadius: '100px', padding: '11px 20px', cursor: 'pointer', border: 'none', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Product Card ─────────────────────────────────────────────────

function ProductCard({ product, categories, onOpen, onRestock }: {
  product: Product;
  categories: ProductCategory[];
  onOpen: (p: Product) => void;
  onRestock: (p: Product) => void;
}) {
  const pct = pctRemaining(product);
  const expiry = expiryStatus(product);
  const chain = getCategoryChain(product.product_category_id, categories);
  const needsRestock = product.is_depleted || (pct != null && pct < 0.2);
  const catLabel = chain ? (chain.sub ? `${chain.top} · ${chain.sub}` : chain.top) : null;
  const dotColor = chain ? chain.dotColor : '#a8a297';
  const usesDisplay = usesRemainingFull(product);
  const hasTracking = product.remaining_amount != null && product.container_size != null && product.container_size > 0;

  return (
    <div
      className="card-lift"
      onClick={() => onOpen(product)}
      style={{ background: '#f6f1e6', border: '1px solid #cdc6b6', borderRadius: '12px', padding: '12px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(43,40,35,0.06)' }}
    >
      {/* Row 1: dot + name + category label */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '2px' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0, marginTop: '3px' }} />
        <span style={{ flex: 1, fontSize: '14px', fontWeight: 500, color: '#2b2823', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</span>
        {catLabel && <span style={{ fontSize: '11px', color: '#a8a297', flexShrink: 0, marginLeft: '6px', whiteSpace: 'nowrap' }}>{catLabel}</span>}
      </div>

      {/* Row 2: brand */}
      {product.brand && (
        <p style={{ fontSize: '11px', color: '#a8a297', marginLeft: '16px', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.brand}</p>
      )}

      {/* Depletion bar */}
      {hasTracking ? (
        <div style={{ marginLeft: '16px', marginTop: product.brand ? 0 : '8px', marginBottom: '4px' }}>
          <DepletionBar
            remainingAmount={product.remaining_amount!}
            totalAmount={product.container_size!}
            usesDisplay={usesDisplay}
          />
        </div>
      ) : product.is_depleted ? (
        <p style={{ fontSize: '11px', color: '#c08a6e', fontWeight: 500, marginLeft: '16px', marginTop: '6px', marginBottom: '4px' }}>Out of product</p>
      ) : null}

      {/* Expiry pill */}
      {expiry && (
        <div style={{ marginLeft: '16px', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', background: 'rgba(192,138,110,0.12)', color: '#c08a6e', borderRadius: '100px', padding: '1px 7px', fontWeight: expiry === 'expired' ? 500 : 400 }}>
            {expiry === 'expired' ? 'Expired' : product.expires_at ? `Exp. ${formatExpiry(product.expires_at)}` : ''}
          </span>
        </div>
      )}

      {/* Action buttons — only when low or depleted */}
      {needsRestock && (
        <div style={{ marginLeft: '16px', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {product.reorder_url && (
            <a
              href={product.reorder_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ fontSize: '11px', color: '#6b665e', textDecoration: 'none', border: '1px solid #cdc6b6', borderRadius: '100px', padding: '3px 10px', cursor: 'pointer', lineHeight: 1, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
            >
              Reorder ↗
            </a>
          )}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onRestock(product); }}
            style={{ border: '1px solid #2b2823', background: 'transparent', color: '#2b2823', fontSize: '11px', borderRadius: '100px', padding: '3px 10px', cursor: 'pointer', lineHeight: 1 }}
          >
            Restock
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Client Component ────────────────────────────────────────

export default function ShelfClient({ userProducts, systemProducts, categories, userId }: Props) {
  const [products, setProducts] = useState<Product[]>(userProducts);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [slideOverProduct, setSlideOverProduct] = useState<Product | null>(null);
  const [restockModal, setRestockModal] = useState<Product | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const topLevel = categories.filter(c => !c.parent_id);

  // Group products by top-level category
  const grouped = (() => {
    const catById = new Map(categories.map(c => [c.id, c]));
    const result: { topCat: ProductCategory; subGroups: { subCat: ProductCategory | null; items: Product[] }[] }[] = [];
    const uncategorized: Product[] = [];

    const activeTopIds = activeCategoryId
      ? new Set(getDescendantIds(categories.find(c => c.id === activeCategoryId)!, categories))
      : null;

    const visible = products.filter(p => !activeTopIds || (p.product_category_id && activeTopIds.has(p.product_category_id)));

    for (const top of topLevel) {
      const topDescIds = new Set(getDescendantIds(top, categories));
      const inTop = visible.filter(p => p.product_category_id && topDescIds.has(p.product_category_id));
      if (inTop.length === 0) continue;

      const subCatsUnder = categories.filter(c => c.parent_id === top.id);
      const subGroups: { subCat: ProductCategory | null; items: Product[] }[] = [];

      if (subCatsUnder.length === 0) {
        subGroups.push({ subCat: null, items: inTop });
      } else {
        for (const sub of subCatsUnder) {
          const subDescIds = new Set(getDescendantIds(sub, categories));
          const inSub = inTop.filter(p => p.product_category_id && subDescIds.has(p.product_category_id));
          if (inSub.length > 0) subGroups.push({ subCat: sub, items: inSub });
        }
        // Products directly in top-level (no sub)
        const topDirectIds = new Set([top.id]);
        const direct = inTop.filter(p => p.product_category_id && topDirectIds.has(p.product_category_id));
        if (direct.length > 0) subGroups.unshift({ subCat: null, items: direct });
      }

      if (subGroups.length > 0) result.push({ topCat: top, subGroups });
    }

    // Products with no category
    const allCatIds = new Set(categories.map(c => c.id));
    for (const p of visible) {
      if (!p.product_category_id || !allCatIds.has(p.product_category_id)) uncategorized.push(p);
    }

    return { groups: result, uncategorized };
  })();

  function handleRestocked(productId: string) {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, is_depleted: false, remaining_amount: p.container_size } : p));
  }

  function handleUpdated(updated: Product) {
    setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
  }

  function handleAdded(newProduct: Product) {
    setProducts(prev => [...prev, newProduct]);
  }

  const hasProducts = products.length > 0;
  const { groups, uncategorized } = grouped;

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Inventory</p>
          <h1 style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '36px', fontWeight: 400, lineHeight: 1.05, color: '#2b2823' }}>Shelf</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          style={{ marginTop: '8px', border: '1px solid #2b2823', background: 'transparent', color: '#2b2823', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '7px 18px', cursor: 'pointer', flexShrink: 0 }}
        >
          + Add product
        </button>
      </div>

      {/* Category filter pills */}
      {hasProducts && topLevel.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '28px' }}>
          <button type="button" onClick={() => setActiveCategoryId(null)}
            style={{ border: `1px solid ${!activeCategoryId ? '#2b2823' : '#cdc6b6'}`, background: !activeCategoryId ? '#2b2823' : 'transparent', color: !activeCategoryId ? '#efe9dd' : '#6b665e', fontSize: '12px', borderRadius: '100px', padding: '5px 14px', cursor: 'pointer' }}>
            All
          </button>
          {topLevel.map(cat => (
            <button key={cat.id} type="button" onClick={() => setActiveCategoryId(activeCategoryId === cat.id ? null : cat.id)}
              style={{ border: `1px solid ${activeCategoryId === cat.id ? '#2b2823' : '#cdc6b6'}`, background: activeCategoryId === cat.id ? '#2b2823' : 'transparent', color: activeCategoryId === cat.id ? '#efe9dd' : '#6b665e', fontSize: '12px', borderRadius: '100px', padding: '5px 14px', cursor: 'pointer' }}>
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {!hasProducts ? (
        <div style={{ textAlign: 'center', padding: '72px 0' }}>
          <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#2b2823', marginBottom: '12px' }}>Your shelf is empty.</p>
          <div style={{ width: '40px', height: '1px', background: '#cdc6b6', margin: '0 auto 12px' }} />
          <button type="button" onClick={() => setShowAdd(true)} style={{ fontSize: '12px', color: '#a8a297', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
            Add your first product
          </button>
        </div>
      ) : groups.length === 0 && uncategorized.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#2b2823', marginBottom: '12px' }}>No products in this category.</p>
          <div style={{ width: '40px', height: '1px', background: '#cdc6b6', margin: '0 auto 12px' }} />
          <button type="button" onClick={() => setActiveCategoryId(null)} style={{ fontSize: '12px', color: '#a8a297', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>View all</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
          {groups.map(({ topCat, subGroups }) => (
            <div key={topCat.id}>
              {/* Top-level section header */}
              <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '16px' }}>{topCat.name}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {subGroups.map(({ subCat, items }) => (
                  <div key={subCat?.id ?? 'direct'}>
                    {subCat && (
                      <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b665e', marginBottom: '12px', borderBottom: '1px solid #cdc6b6', paddingBottom: '6px' }}>{subCat.name}</p>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                      {items.map(p => (
                        <ProductCard key={p.id} product={p} categories={categories} onOpen={setSlideOverProduct} onRestock={setRestockModal} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {uncategorized.length > 0 && (
            <div>
              <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '16px' }}>Other</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                {uncategorized.map(p => (
                  <ProductCard key={p.id} product={p} categories={categories} onOpen={setSlideOverProduct} onRestock={setRestockModal} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals + Slide-over */}
      {slideOverProduct && (
        <ProductSlideOver
          product={slideOverProduct}
          categories={categories}
          onClose={() => setSlideOverProduct(null)}
          onUpdated={p => { handleUpdated(p); setSlideOverProduct(null); }}
          onRestock={p => { setSlideOverProduct(null); setRestockModal(p); }}
        />
      )}
      {restockModal && (
        <RestockModal
          product={restockModal}
          onClose={() => setRestockModal(null)}
          onRestocked={handleRestocked}
        />
      )}
      {showAdd && (
        <AddProductModal
          systemProducts={systemProducts}
          categories={categories}
          userId={userId}
          onClose={() => setShowAdd(false)}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}
