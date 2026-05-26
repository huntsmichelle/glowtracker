'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Routine } from '@/types';

interface Props {
  template: Routine;
}

export default function RoutineFromTemplateClient({ template }: Props) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim()) { setError('Name is required'); return; }

    setCreating(true);
    setError('');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: newRoutine, error: err } = await supabase
      .from('routines')
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: template.description,
        color: template.color,
        is_template: false,
        is_public: false,
        template_source_id: template.id,
      })
      .select('id')
      .single();

    if (err) { setError(err.message); setCreating(false); return; }

    router.push(`/routines/${newRoutine.id}`);
  }

  return (
    <div className="space-y-4 pt-4 border-t border-glow-border">
      <p className="label-overline">Use this template</p>
      <div>
        <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Routine name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full"
        />
      </div>
      {error && (
        <p className="text-charcoal bg-dust-lt border border-dust rounded-md px-3 py-2 text-xs">{error}</p>
      )}
      <button
        onClick={handleCreate}
        disabled={creating}
        className="w-full bg-charcoal hover:bg-charcoal/90 text-cream text-sm font-medium rounded-pill py-2.5 disabled:opacity-50"
      >
        {creating ? 'Creating…' : 'Create from Template'}
      </button>
    </div>
  );
}
