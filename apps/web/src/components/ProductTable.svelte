<script lang="ts">
  import { formatMoney, stockStatus, type Product, type StockStatus } from '@catalog/shared';

  let { products, onselect }: { products: Product[]; onselect: (product: Product) => void } =
    $props();

  const badges: Record<StockStatus, { label: string; classes: string }> = {
    out: { label: 'Out of stock', classes: 'bg-red-100 text-red-800' },
    low: { label: 'Low stock', classes: 'bg-amber-100 text-amber-800' },
    in: { label: 'In stock', classes: 'bg-emerald-100 text-emerald-800' },
  };
</script>

<div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
  <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
    <thead class="bg-slate-50 text-xs font-semibold tracking-wide text-slate-600 uppercase">
      <tr>
        <th scope="col" class="px-4 py-3">Product</th>
        <th scope="col" class="px-4 py-3">Brand</th>
        <th scope="col" class="px-4 py-3">Category</th>
        <th scope="col" class="px-4 py-3 text-right">Price</th>
        <th scope="col" class="px-4 py-3 text-right">Stock</th>
        <th scope="col" class="px-4 py-3">Status</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-slate-100">
      {#each products as product (product.id)}
        {@const badge = badges[stockStatus(product.stock)]}
        <!-- The row click is a mouse convenience; the title button below is the keyboard path (its click bubbles here). -->
        <tr class="cursor-pointer hover:bg-slate-50" onclick={() => onselect(product)}>
          <td class="px-4 py-3">
            <button type="button" class="text-left font-medium text-slate-900 hover:underline">
              {product.title}
            </button>
            <div class="text-xs text-slate-500">{product.sku}</div>
          </td>
          <td class="px-4 py-3 text-slate-700">{product.brand}</td>
          <td class="px-4 py-3 text-slate-700">{product.category}</td>
          <td class="px-4 py-3 text-right text-slate-900 tabular-nums">
            {formatMoney(product.price)}
          </td>
          <td class="px-4 py-3 text-right text-slate-900 tabular-nums">{product.stock}</td>
          <td class="px-4 py-3">
            <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {badge.classes}">
              {badge.label}
            </span>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
