<script lang="ts">
  import type { ProductStats, StockStatus } from '@catalog/shared';
  import { catalog } from '../lib/stores/catalog.svelte.js';
  import { stats } from '../lib/stores/stats.svelte.js';

  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const integer = new Intl.NumberFormat('en-US');

  const numbers = $derived(stats.stats);
  const show = (value: number | undefined) => (value === undefined ? '—' : integer.format(value));

  // The Low and Out tiles are the list's stock filter: pressing one shows those products.
  const filterTiles: {
    status: StockStatus;
    label: string;
    field: keyof ProductStats;
    tone: string;
  }[] = [
    { status: 'low', label: 'Low stock', field: 'lowStock', tone: 'text-amber-700' },
    { status: 'out', label: 'Out of stock', field: 'outOfStock', tone: 'text-red-700' },
  ];
</script>

<section aria-label="Catalog metrics">
  <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
    <div class="rounded-lg border border-slate-200 bg-white p-3">
      <p class="text-xs font-medium text-slate-600">Total products</p>
      <p class="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
        {show(numbers?.total)}
      </p>
    </div>

    {#each filterTiles as tile (tile.status)}
      {@const active = catalog.params.stockStatus === tile.status}
      {@const value = numbers?.[tile.field]}
      <button
        type="button"
        aria-pressed={active}
        class="rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 {active
          ? 'border-slate-900 bg-slate-100 ring-1 ring-slate-900'
          : 'border-slate-200 bg-white hover:border-slate-400'}"
        onclick={() => void catalog.toggleStockStatus(tile.status)}
      >
        <span class="block text-xs font-medium text-slate-600">
          {tile.label}
          <span class="sr-only">
            {active ? '(filter on, activate to clear)' : '(activate to filter the list)'}
          </span>
        </span>
        <span
          class="mt-1 block text-2xl font-semibold tabular-nums {value
            ? tile.tone
            : 'text-slate-900'}"
        >
          {show(value)}
        </span>
      </button>
    {/each}

    <div class="rounded-lg border border-slate-200 bg-white p-3">
      <p class="text-xs font-medium text-slate-600">Inventory value</p>
      <p class="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
        {numbers ? currency.format(numbers.inventoryValue) : '—'}
      </p>
    </div>
  </div>

  {#if stats.status === 'error'}
    <p role="status" class="mt-2 text-sm text-slate-600">
      Could not load the metrics.
      <button type="button" class="underline" onclick={() => void stats.load()}>Try again</button>
    </p>
  {/if}
</section>
