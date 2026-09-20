<script lang="ts">
  import { onMount } from 'svelte';
  import Filters from '../components/Filters.svelte';
  import MetricTiles from '../components/MetricTiles.svelte';
  import Pagination from '../components/Pagination.svelte';
  import ProductTable from '../components/ProductTable.svelte';
  import { paramsFromSearch, paramsToSearch } from '../lib/query-params.js';
  import { catalog } from '../lib/stores/catalog.svelte.js';
  import { productDialog } from '../lib/stores/product-dialog.svelte.js';
  import { stats } from '../lib/stores/stats.svelte.js';
  import CategoryManager from './CategoryManager.svelte';
  import ProductDialog from './ProductDialog.svelte';

  // A shared link opens straight onto its query.
  catalog.params = paramsFromSearch(location.search);

  const filtered = $derived(
    catalog.params.q !== '' || catalog.params.category !== '' || catalog.params.stockStatus !== '',
  );
  const range = $derived.by(() => {
    const { meta, products } = catalog;
    if (!meta || products.length === 0) return null;
    const from = (meta.page - 1) * meta.pageSize + 1;
    return { from, to: from + products.length - 1, total: meta.total };
  });

  onMount(() => {
    void catalog.load();
    void stats.load();

    const onPopState = () => void catalog.applyParams(paramsFromSearch(location.search));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  });

  // Mirror the params into the URL so a filtered view is shareable and Back restores it. A URL
  // that already shows the params (after Back, or on first load) adds no history entry.
  let firstRun = true;
  $effect(() => {
    const search = paramsToSearch(catalog.params);
    const url = search ? `?${search}` : location.pathname;

    if (firstRun) {
      firstRun = false;
      history.replaceState(null, '', url);
    } else if (search !== location.search.slice(1)) {
      history.pushState(null, '', url);
    }
  });
</script>

<section aria-labelledby="products-heading">
  <div class="flex items-center justify-between gap-4">
    <h2 id="products-heading" class="text-lg font-semibold text-slate-900">Products</h2>
    <button
      type="button"
      class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
      onclick={() => productDialog.openCreate()}
    >
      New product
    </button>
  </div>

  <div class="mt-4">
    <MetricTiles />
  </div>

  <div class="mt-4">
    <Filters />
  </div>

  <div class="mt-4">
    {#if catalog.status === 'error'}
      <div role="alert" class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p class="font-medium">Could not load products</p>
        <p class="mt-1 text-sm">{catalog.error?.message}</p>
        <button
          type="button"
          class="mt-3 rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
          onclick={() => catalog.load()}
        >
          Try again
        </button>
      </div>
    {:else if catalog.products.length === 0 && catalog.status === 'loading'}
      <p role="status" class="text-slate-600">Loading products…</p>
    {:else if catalog.products.length === 0}
      <div class="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-600">
        {#if catalog.params.page > 1}
          <p>No products on this page.</p>
          <button
            type="button"
            class="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
            onclick={() => catalog.update({ page: 1 })}
          >
            Back to page 1
          </button>
        {:else if filtered}
          <p>No products match your search.</p>
          <button
            type="button"
            class="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
            onclick={() => catalog.update({ q: '', category: '', stockStatus: '' })}
          >
            Clear search
          </button>
        {:else}
          <p>No products yet.</p>
        {/if}
      </div>
    {:else}
      <!-- The previous rows stay on screen, dimmed, while the next ones load. -->
      <div
        class={catalog.status === 'loading' ? 'opacity-60 transition-opacity' : ''}
        aria-busy={catalog.status === 'loading'}
      >
        <ProductTable
          products={catalog.products}
          onselect={(product) => void productDialog.openDetail(product)}
        />
      </div>
      {#if range}
        <p class="mt-3 text-sm text-slate-600" role="status">
          Showing {range.from}–{range.to} of {range.total} products
        </p>
      {/if}
      {#if catalog.meta}
        <Pagination meta={catalog.meta} onpage={(page) => catalog.update({ page })} />
      {/if}
    {/if}
  </div>

  <ProductDialog />
  <CategoryManager />
</section>
