import { createClient } from '@/lib/supabase/server';
import { RitualLibraryClient } from './RitualLibraryClient';

export const dynamic = 'force-dynamic';

export default async function AddRitualPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: tasks, error }, { data: userTasks }] = await Promise.all([
    supabase
      .from('common_tasks')
      .select('id, name, category, interval_min_days, interval_max_days, description, prep_steps, suggested_notes')
      .order('category', { ascending: true })
      .order('name', { ascending: true }),
    user
      ? supabase
          .from('tasks')
          .select('name')
          .eq('user_id', user.id)
          .eq('is_active', true)
      : Promise.resolve({ data: [] as { name: string }[] }),
  ]);

  if (error) {
    console.error('common_tasks query error:', error);
  }

  // Hide library rituals the user already has (case-insensitive name match).
  const existing = new Set(
    (userTasks ?? []).map(t => t.name.toLowerCase().trim())
  );
  const available = (tasks ?? []).filter(
    t => !existing.has(t.name.toLowerCase().trim())
  );

  return <RitualLibraryClient tasks={available} />;
}
