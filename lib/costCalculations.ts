import type { Task, TaskProduct } from '@/types';

/**
 * Total cost per instance: provider cost + sum of product cost-per-use values.
 */
export function calculateInstanceCost(task: Task, taskProducts: TaskProduct[]): number {
  const providerCost = task.provider_cost ?? 0;
  const productCost = taskProducts.reduce((sum, tp) => {
    return tp.cost_per_use != null ? sum + Number(tp.cost_per_use) : sum;
  }, 0);
  return providerCost + productCost;
}

/**
 * Format a digit string as (XXX) XXX-XXXX.
 * Returns the input unchanged if it's not exactly 10 digits after stripping.
 */
export function formatUSPhone(digits: string): string {
  const cleaned = digits.replace(/\D/g, '');
  if (cleaned.length !== 10) return digits;
  return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
}

/**
 * Strip non-digit characters and truncate to 10 digits for DB storage.
 */
export function stripPhoneFormatting(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10);
}
