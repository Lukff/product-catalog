<script lang="ts">
  import { stockStatus, type Product, type StockStatus } from '@catalog/shared';
  import type { ApiError } from '../lib/api.js';
  import type { DetailStatus } from '../lib/stores/product-dialog.svelte.js';

  let {
    product,
    status,
    error,
    onedit,
    ondelete,
  }: {
    product: Product;
    status: DetailStatus;
    error: ApiError | null;
    onedit: () => void;
    ondelete: () => void;
  } = $props();

  const badges: Record<StockStatus, { label: string; classes: string }> = {
    out: { label: 'Out of stock', classes: 'bg-red-100 text-red-800' },
    low: { label: 'Low stock', classes: 'bg-amber-100 text-amber-800' },
    in: { label: 'In stock', classes: 'bg-emerald-100 text-emerald-800' },
  };
  const badge = $derived(badges[stockStatus(product.stock)]);
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const when = (iso: string) => new Date(iso).toLocaleString();
</script>

{#if status === 'error'}
  <p
    role="alert"
    class="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
  >
    Could not refresh this product: {error?.message}. Showing the version from the list.
  </p>
{:else if status === 'loading'}
  <p role="status" class="mb-4 text-sm text-slate-500">Refreshing…</p>
{/if}

<dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
  <div class="sm:col-span-2">
    <dt class="text-xs font-medium uppercase text-slate-500">Description</dt>
    <dd class="mt-0.5 whitespace-pre-wrap text-slate-900">{product.description}</dd>
  </div>
  <div>
    <dt class="text-xs font-medium uppercase text-slate-500">Brand</dt>
    <dd class="mt-0.5">{product.brand}</dd>
  </div>
  <div>
    <dt class="text-xs font-medium uppercase text-slate-500">Category</dt>
    <dd class="mt-0.5">{product.category}</dd>
  </div>
  <div>
    <dt class="text-xs font-medium uppercase text-slate-500">SKU</dt>
    <dd class="mt-0.5">{product.sku}</dd>
  </div>
  <div>
    <dt class="text-xs font-medium uppercase text-slate-500">Price</dt>
    <dd class="mt-0.5 tabular-nums">{currency.format(product.price)}</dd>
  </div>
  <div>
    <dt class="text-xs font-medium uppercase text-slate-500">Stock</dt>
    <dd class="mt-0.5 flex items-center gap-2">
      <span class="tabular-nums">{product.stock}</span>
      <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {badge.classes}">
        {badge.label}
      </span>
    </dd>
  </div>
  <div>
    <dt class="text-xs font-medium uppercase text-slate-500">Weight</dt>
    <dd class="mt-0.5 tabular-nums">{product.weight}</dd>
  </div>
  <div>
    <dt class="text-xs font-medium uppercase text-slate-500">Created</dt>
    <dd class="mt-0.5">{when(product.meta.createdAt)}</dd>
  </div>
  <div>
    <dt class="text-xs font-medium uppercase text-slate-500">Updated</dt>
    <dd class="mt-0.5">{when(product.meta.updatedAt)}</dd>
  </div>
</dl>

<div class="mt-6 flex justify-end gap-3">
  <button
    type="button"
    class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
    disabled={status === 'loading'}
    onclick={onedit}
  >
    Edit
  </button>
  <button
    type="button"
    class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
    disabled={status === 'loading'}
    onclick={ondelete}
  >
    Delete
  </button>
</div>
