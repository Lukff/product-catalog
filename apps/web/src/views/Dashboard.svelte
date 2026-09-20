<script lang="ts">
  import { onMount } from 'svelte';
  import ProductTable from '../components/ProductTable.svelte';
  import { catalog } from '../lib/stores/catalog.svelte.js';

  onMount(() => {
    void catalog.load();
  });
</script>

<section aria-labelledby="products-heading">
  <h2 id="products-heading" class="text-lg font-semibold text-slate-900">Products</h2>

  <div class="mt-4">
    {#if catalog.status === 'loading'}
      <p role="status" class="text-slate-600">Loading products…</p>
    {:else if catalog.status === 'error'}
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
    {:else if catalog.products.length === 0}
      <p class="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-600">
        No products yet.
      </p>
    {:else}
      <ProductTable products={catalog.products} />
      {#if catalog.meta}
        <p class="mt-3 text-sm text-slate-600">
          Showing {catalog.products.length} of {catalog.meta.total} products
        </p>
      {/if}
    {/if}
  </div>
</section>
