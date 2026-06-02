import { createClient } from '@/lib/supabase/server';
import { RitualLibraryClient } from './RitualLibraryClient';

export const dynamic = 'force-dynamic';

export default async function AddRitualPage() {
  const supabase = await createClient();
  const { data: tasks, error } = await supabase
    .from('common_tasks')
    .select('id, name, category, interval_min_days, interval_max_days, description, prep_steps, suggested_notes')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('common_tasks query error:', error);
  }

  return <RitualLibraryClient tasks={tasks ?? []} />;
}
