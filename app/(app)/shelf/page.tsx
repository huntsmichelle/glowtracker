import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ShelfClient from '@/components/ShelfClient';
import type { Product, ProductCategory } from '@/types';

export const dynamic = 'force-dynamic';

export default async function ShelfPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const SYSTEM_USER = 'db24c2d7-e677-45af-add3-a155a87c75e0';

  const [{ data: userProducts }, { data: systemProducts }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .order('name'),
    supabase
      .from('products')
      .select('*')
      .eq('user_id', SYSTEM_USER)
      .order('name'),
    supabase
      .from('product_categories')
      .select('*')
      .order('sort_order'),
  ]);

  return (
    <ShelfClient
      userProducts={(userProducts ?? []) as Product[]}
      systemProducts={(systemProducts ?? []) as Product[]}
      categories={(categories ?? []) as ProductCategory[]}
      userId={user.id}
    />
  );
}
