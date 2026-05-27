'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { restockProduct } from '@/lib/productTracking';
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

function computeUsesLeft(product: Product): number | null {
  if (product.remaining_amount == null || !product.container_size || !product.uses_per_supply_unit) return null;
  const amtPerUse = product.container_size / product.uses_per_supply_unit;
  if (amtPerUse <= 0) return null;
  return Math.round(product.remaining_amount / amtPerUse);
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
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [topCatId, setTopCatId] = useState('');
  const [containerSize, setContainerSize] = useState('');
  const [containerUnit, setContainerUnit] = useState('ml');
  const [usesPerContainer, setUsesPerContainer] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topLevelCats = categories.filter(c => !c.parent_id);
  const subCats = topCatId ? categories.filter(c => c.parent_id === topCatId) : [];

  const seedMatches = search.length >= 2
    ? systemProducts.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : [];

  function prefillFromSeed(seed: Product) {
    setName(seed.name);
    setBrand(seed.brand ?? '');
    setProductUrl(seed.product_url ?? '');
    if (seed.product_category_id) {
      const cat = categories.find(c => c.id === seed.product_category_id);
      if (cat?.parent_id) {
        setTopCatId(cat.parent_id);
        setCategoryId(cat.id);
      } else if (cat) {
        setTopCatId(cat.id);
        setCategoryId('');
      }
    }
    if (seed.container_size != null) setContainerSize(String(seed.container_size));
    if (seed.container_unit) setContainerUnit(seed.container_unit);
    setSearch('');
  }

  async function handleSave() {
    if (!name.trim()) { setError('Product name is required.'); return; }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const finalCatId = categoryId || topCatId || null;
    const { data, error: err } = await supabase.from('products').insert({
      user_id: userId,
      name: name.trim(),
      brand: brand.trim() || null,
      product_url: productUrl.trim() || null,
      product_category_id: finalCatId,
      container_size: containerSize !== '' ? Number(containerSize) : null,
      container_unit: containerUnit || null,
      uses_per_supply_unit: usesPerContainer !== '' ? Number(usesPerContainer) : null,
      remaining_amount: containerSize !== '' ? Number(containerSize) : null,
      is_depleted: false,
      expires_at: expiresAt ? expiresAt + '-01' : null,
    }).select().single();
    if (err || !data) { setError(err?.message ?? 'Could not save product.'); setSaving(false); return; }
    onAdded(data as Product);
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(43,40,35,0.35)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#f6f1e6', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 8px 32px rgba(43,40,35,0.14)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#2b2823' }}>Add product</p>

        {/* Seed search */}
        <div style={{ position: 'relative' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Search common products</label>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="e.g. vitamin C serum…"
            style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }} />
          {seedMatches.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#f6f1e6', border: '1px solid #cdc6b6', borderRadius: '8px', zIndex: 10, boxShadow: '0 4px 12px rgba(43,40,35,0.1)', marginTop: '4px' }}>
              {seedMatches.map(s => (
                <button key={s.id} type="button" onClick={() => prefillFromSeed(s)}
                  style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: '13px', color: '#2b2823', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #cdc6b6' }}>
                  {s.name}{s.brand ? ` · ${s.brand}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: '1px', background: '#cdc6b6' }} />

        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Product name *"
          style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }} />
        <input type="text" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand (optional)"
          style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }} />

        {/* Two-level category picker */}
        {topLevelCats.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Category</label>
              <select value={topCatId} onChange={e => { setTopCatId(e.target.value); setCategoryId(''); }}
                style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', background: '#ede8db', color: '#2b2823' }}>
                <option value="">Select…</option>
                {topLevelCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {subCats.length > 0 && (
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Subcategory</label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                  style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', background: '#ede8db', color: '#2b2823' }}>
                  <option value="">Select…</option>
                  {subCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Container size + unit */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Container size</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input type="number" min={0} value={containerSize} onChange={e => setContainerSize(e.target.value)} placeholder="150"
                style={{ flex: 1, border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }} />
              <select value={containerUnit} onChange={e => setContainerUnit(e.target.value)}
                style={{ border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px', fontSize: '13px', background: '#ede8db', color: '#2b2823' }}>
                {['ml', 'fl oz', 'g', 'oz', 'kit', 'strips'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Uses per container</label>
            <input type="number" min={1} value={usesPerContainer} onChange={e => setUsesPerContainer(e.target.value)} placeholder="e.g. 60"
              style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }} />
          </div>
        </div>

        {/* Purchase price */}
        <div>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Purchase price</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #cdc6b6', borderRadius: '8px', background: '#ede8db', padding: '8px 12px' }}>
            <span style={{ fontSize: '13px', color: '#6b665e', flexShrink: 0 }}>$</span>
            <input type="number" min={0} step="0.01" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="0.00"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: '#2b2823' }} />
          </div>
        </div>

        {/* Expiration */}
        <div>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Expiration (optional)</label>
          <input type="month" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
            style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }} />
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
  const [containerSize, setContainerSize] = useState(product.container_size != null ? String(product.container_size) : '');
  const [containerUnit, setContainerUnit] = useState(product.container_unit ?? 'ml');
  const [remaining, setRemaining] = useState(product.remaining_amount != null ? String(product.remaining_amount) : '');
  const [expiresAt, setExpiresAt] = useState(product.expires_at ? product.expires_at.slice(0, 7) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topLevelCats = categories.filter(c => !c.parent_id);
  const selectedCatObj = categories.find(c => c.id === product.product_category_id);
  const [topCatId, setTopCatId] = useState(selectedCatObj?.parent_id ?? (selectedCatObj?.id ?? ''));
  const [categoryId, setCategoryId] = useState(selectedCatObj?.parent_id ? product.product_category_id ?? '' : '');
  const subCats = topCatId ? categories.filter(c => c.parent_id === topCatId) : [];

  const pct = pctRemaining(product);
  const bColor = pct != null ? barColor(pct) : '#cdc6b6';
  const expiry = expiryStatus(product);

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const finalCatId = categoryId || topCatId || null;
    const newRemaining = remaining !== '' ? Number(remaining) : null;
    const { data, error: err } = await supabase.from('products').update({
      name: name.trim(),
      brand: brand.trim() || null,
      product_url: productUrl.trim() || null,
      product_category_id: finalCatId,
      container_size: containerSize !== '' ? Number(containerSize) : null,
      container_unit: containerUnit || null,
      remaining_amount: newRemaining,
      is_depleted: newRemaining !== null && newRemaining <= 0,
      expires_at: expiresAt ? expiresAt + '-01' : null,
    }).eq('id', product.id).eq('user_id', product.user_id).select().single();
    if (err || !data) { setError(err?.message ?? 'Could not save.'); setSaving(false); return; }
    onUpdated(data as Product);
    onClose();
  }

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
            <DepletionBar remainingAmount={product.remaining_amount ?? 0} totalAmount={product.container_size} unit={product.container_unit ?? undefined} showLabel />
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
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Brand</label>
            <input type="text" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Optional"
              style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }} />
          </div>

          {/* Category picker */}
          {topLevelCats.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Category</label>
                <select value={topCatId} onChange={e => { setTopCatId(e.target.value); setCategoryId(''); }}
                  style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px', fontSize: '13px', background: '#ede8db', color: '#2b2823' }}>
                  <option value="">Select…</option>
                  {topLevelCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {subCats.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Subcategory</label>
                  <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                    style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px', fontSize: '13px', background: '#ede8db', color: '#2b2823' }}>
                    <option value="">Select…</option>
                    {subCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Container */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Container size</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input type="number" min={0} value={containerSize} onChange={e => setContainerSize(e.target.value)} placeholder="e.g. 150"
                  style={{ flex: 1, border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 10px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }} />
                <select value={containerUnit} onChange={e => setContainerUnit(e.target.value)}
                  style={{ border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px', fontSize: '13px', background: '#ede8db', color: '#2b2823' }}>
                  {['ml', 'fl oz', 'g', 'oz', 'kit', 'strips'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Remaining</label>
              <input type="number" min={0} value={remaining} onChange={e => setRemaining(e.target.value)} placeholder="e.g. 75"
                style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }} />
            </div>
          </div>

          {/* Expiration */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Expiration (optional)</label>
            <input type="month" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }} />
          </div>

          {/* Product URL */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '6px' }}>Product URL</label>
            <input type="text" value={productUrl} onChange={e => setProductUrl(e.target.value)} placeholder="https://…"
              style={{ width: '100%', border: '1px solid #cdc6b6', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: '#ede8db', color: '#2b2823' }} />
          </div>

          {error && <p style={{ fontSize: '12px', color: '#c08a6e' }}>{error}</p>}
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
  const usesRemaining = computeUsesLeft(product);
  const needsRestock = product.is_depleted || (pct != null && pct < 0.2);
  const catLabel = chain ? (chain.sub ? `${chain.top} · ${chain.sub}` : chain.top) : null;
  const dotColor = chain ? chain.dotColor : '#a8a297';

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
      {product.remaining_amount != null && product.container_size != null && product.container_size > 0 ? (
        <div style={{ marginLeft: '16px', marginTop: product.brand ? 0 : '8px', marginBottom: '6px' }}>
          <DepletionBar
            remainingAmount={product.remaining_amount}
            totalAmount={product.container_size}
            unit={product.container_unit ?? undefined}
            usesRemaining={usesRemaining}
            showLabel
          />
        </div>
      ) : product.is_depleted ? (
        <p style={{ fontSize: '11px', color: '#c08a6e', fontWeight: 500, marginLeft: '16px', marginTop: '6px' }}>Out of stock</p>
      ) : null}

      {/* Stats line: remaining amount */}
      {product.remaining_amount != null && !product.is_depleted && product.container_size != null && (
        <p style={{ fontSize: '12px', color: '#6b665e', marginLeft: '16px', marginBottom: '4px' }}>
          {product.remaining_amount} {product.container_unit ?? ''} left
        </p>
      )}

      {/* Expiry pill */}
      {expiry && (
        <div style={{ marginLeft: '16px', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', background: 'rgba(192,138,110,0.12)', color: '#c08a6e', borderRadius: '100px', padding: '1px 7px', fontWeight: expiry === 'expired' ? 500 : 400 }}>
            {expiry === 'expired' ? 'Expired' : product.expires_at ? `Exp. ${formatExpiry(product.expires_at)}` : ''}
          </span>
        </div>
      )}

      {/* Restock button */}
      {needsRestock && (
        <div style={{ marginLeft: '16px', marginTop: '6px' }}>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onRestock(product); }}
            style={{ border: '1px solid #2b2823', background: 'transparent', color: '#2b2823', fontSize: '11px', borderRadius: '100px', padding: '3px 10px', cursor: 'pointer', height: '24px', lineHeight: 1 }}
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
