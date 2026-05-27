import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product, TaskProduct } from '@/types';

// ── Display helpers (uses-remaining, no taskProduct needed) ───

function computeDefaultUseAmount(product: Product): number | null {
  if (
    product.container_size && product.uses_per_supply_unit &&
    product.uses_per_supply_unit > 0
  ) {
    return product.container_size / product.uses_per_supply_unit;
  }
  return null;
}

export function productUsesRemainingRaw(product: Product, useAmountOverride?: number): number {
  const perUse = useAmountOverride ?? computeDefaultUseAmount(product);
  if (!product.remaining_amount || !perUse || perUse <= 0) return 0;
  return product.remaining_amount / perUse;
}

export function usesRemainingDisplay(product: Product, useAmountOverride?: number): string {
  if (product.is_depleted) return 'out';
  const uses = productUsesRemainingRaw(product, useAmountOverride);
  if (uses <= 0) return 'out';
  if (uses < 1) return 'less than 1 use';
  const rounded = Math.floor(uses);
  return `${rounded} ${rounded === 1 ? 'use' : 'uses'} left`;
}

export function usesRemainingFull(product: Product, useAmountOverride?: number): string {
  if (product.is_depleted) return 'out of product';
  const perUse = useAmountOverride ?? computeDefaultUseAmount(product);
  const uses = productUsesRemainingRaw(product, useAmountOverride);
  const total = product.container_size && perUse ? Math.floor(product.container_size / perUse) : null;

  if (uses <= 0) return 'out of product';
  if (uses < 1) return 'less than 1 use left';
  const rounded = Math.floor(uses);
  if (total) return `${rounded} of ${total} uses left`;
  return `${rounded} ${rounded === 1 ? 'use' : 'uses'} left`;
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Amount consumed per use of a product on a specific task.
 * Prefers the task-level override, falls back to container_size / uses_per_container.
 */
export function effectiveUseAmount(
  product: Product,
  taskProduct: TaskProduct,
): number | null {
  if (taskProduct.use_amount_override != null) return taskProduct.use_amount_override;
  if (product.container_size && taskProduct.uses_per_container && taskProduct.uses_per_container > 0) {
    return product.container_size / taskProduct.uses_per_container;
  }
  return null;
}

/**
 * Uses remaining in the current container, rounded down.
 * Returns null when tracking data is incomplete.
 */
export function usesRemaining(
  product: Product,
  taskProduct: TaskProduct,
): number | null {
  if (product.remaining_amount == null) return null;
  const perUse = effectiveUseAmount(product, taskProduct);
  if (!perUse || perUse <= 0) return null;
  return Math.floor(product.remaining_amount / perUse);
}

/**
 * Returns the alert type that should fire now, or null.
 * 'last_use'  — one use (or fewer) left and threshold met.
 * 'depleted'  — remaining is at or below zero.
 */
export function checkAlertStatus(
  product: Product,
  taskProduct: TaskProduct,
): 'last_use' | 'depleted' | null {
  if (product.remaining_amount == null) return null;

  if (product.remaining_amount <= 0 || product.is_depleted) return 'depleted';

  const uses = usesRemaining(product, taskProduct);
  if (uses == null) return null;

  const threshold = product.alert_threshold_uses ?? 1;
  if (uses <= threshold) return 'last_use';

  return null;
}

// ── Main side-effect functions ────────────────────────────────

/**
 * Called after an instance is marked kept.
 * - Reduces remaining_amount for each tracked product linked to the task.
 * - Logs usage to product_usage_log.
 * - Creates a product_alert if warranted (deduped by product + pending).
 *
 * Non-throwing: any failure is logged to console only.
 * Callers must NOT await this in a way that blocks the kept flow.
 */
export async function processInstanceKept(
  supabase: SupabaseClient,
  instanceId: string,
  taskId: string,
  userId: string,
): Promise<void> {
  try {
    // Fetch task_products with their product data
    const { data: taskProducts, error: tpErr } = await supabase
      .from('task_products')
      .select('*, product:products(*)')
      .eq('task_id', taskId)
      .eq('user_id', userId)
      .eq('track_usage', true);

    if (tpErr || !taskProducts?.length) return;

    await Promise.all(
      taskProducts.map(async (tp: TaskProduct & { product: Product }) => {
        const product = tp.product;
        if (!product) return;

        const useAmount = effectiveUseAmount(product, tp);
        if (useAmount == null || product.remaining_amount == null) return;

        const newRemaining = Math.max(0, product.remaining_amount - useAmount);
        const isDepleted = newRemaining <= 0;

        // Update remaining_amount and is_depleted
        const { error: updateErr } = await supabase
          .from('products')
          .update({ remaining_amount: newRemaining, is_depleted: isDepleted })
          .eq('id', product.id);

        if (updateErr) {
          console.error('[productTracking] update remaining_amount failed', updateErr);
          return;
        }

        // Log usage
        await supabase.from('product_usage_log').insert({
          user_id: userId,
          product_id: product.id,
          task_id: taskId,
          instance_id: instanceId,
          amount_used: useAmount,
          unit: product.container_unit,
          remaining_after: newRemaining,
        });

        // Check if we should create an alert
        const updatedProduct = { ...product, remaining_amount: newRemaining, is_depleted: isDepleted };
        const alertType = checkAlertStatus(updatedProduct, tp);
        if (!alertType) return;

        // Dedup: skip if a pending alert of this type already exists for this product
        const { data: existing } = await supabase
          .from('product_alerts')
          .select('id')
          .eq('product_id', product.id)
          .eq('user_id', userId)
          .eq('alert_type', alertType)
          .eq('status', 'pending')
          .limit(1);

        if (existing?.length) return;

        await supabase.from('product_alerts').insert({
          user_id: userId,
          product_id: product.id,
          task_id: taskId,
          instance_id: instanceId,
          alert_type: alertType,
          status: 'pending',
        });
      }),
    );
  } catch (err) {
    console.error('[productTracking] processInstanceKept error', err);
  }
}

/**
 * Called when a user restocks a product.
 * - Resets remaining_amount to container_size.
 * - Clears is_depleted flag.
 * - Sets last_restocked_at.
 * - Dismisses all pending alerts for this product.
 */
export async function restockProduct(
  supabase: SupabaseClient,
  productId: string,
  userId: string,
  newContainerSize?: number,
): Promise<{ error: string | null }> {
  try {
    // Fetch current product
    const { data: product, error: fetchErr } = await supabase
      .from('products')
      .select('container_size')
      .eq('id', productId)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !product) return { error: 'Product not found.' };

    const containerSize = newContainerSize ?? product.container_size;

    const updates: Record<string, unknown> = {
      is_depleted: false,
      last_restocked_at: new Date().toISOString(),
      remaining_amount: containerSize ?? null,
    };

    if (newContainerSize != null) {
      updates.container_size = newContainerSize;
    }

    const { error: updateErr } = await supabase
      .from('products')
      .update(updates)
      .eq('id', productId)
      .eq('user_id', userId);

    if (updateErr) return { error: updateErr.message };

    // Dismiss pending alerts
    await supabase
      .from('product_alerts')
      .update({ status: 'actioned' })
      .eq('product_id', productId)
      .eq('user_id', userId)
      .eq('status', 'pending');

    return { error: null };
  } catch (err) {
    console.error('[productTracking] restockProduct error', err);
    return { error: 'Unexpected error.' };
  }
}
