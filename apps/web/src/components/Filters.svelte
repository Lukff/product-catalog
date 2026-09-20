<script lang="ts">
  import type { SortParam } from '@catalog/shared';
  import { onDestroy, onMount } from 'svelte';
  import { catalog } from '../lib/stores/catalog.svelte.js';
  import { categories } from '../lib/stores/categories.svelte.js';

  const SEARCH_DEBOUNCE_MS = 300;

  const sortOptions: { value: SortParam | ''; label: string }[] = [
    { value: '', label: 'Default order' },
    { value: 'title', label: 'Title A–Z' },
    { value: '-title', label: 'Title Z–A' },
    { value: 'price', label: 'Price, low to high' },
    { value: '-price', label: 'Price, high to low' },
    { value: 'stock', label: 'Stock, low to high' },
    { value: '-stock', label: 'Stock, high to low' },
    { value: '-createdAt', label: 'Newest first' },
  ];
  const pageSizes = [10, 30, 50, 100];

  // Follows the store (so Back/forward updates the box) but can be typed into before the
  // debounced update reaches the store.
  let search = $derived(catalog.params.q);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function onSearchInput() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (search !== catalog.params.q) void catalog.update({ q: search });
    }, SEARCH_DEBOUNCE_MS);
  }

  onMount(() => void categories.load());
  onDestroy(() => clearTimeout(timer));
</script>

<form
  class="flex flex-wrap items-end gap-4"
  role="search"
  aria-label="Filter products"
  onsubmit={(event) => event.preventDefault()}
>
  <div class="min-w-56 flex-1">
    <label for="search" class="block text-xs font-medium text-slate-600">Search</label>
    <input
      id="search"
      type="search"
      class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      placeholder="Title or description"
      bind:value={search}
      oninput={onSearchInput}
    />
  </div>

  <div>
    <label for="category" class="block text-xs font-medium text-slate-600">Category</label>
    <div class="mt-1 flex gap-2">
      <select
        id="category"
        class="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        value={catalog.params.category}
        onchange={(event) => void catalog.update({ category: event.currentTarget.value })}
      >
        <option value="">All categories</option>
        {#each categories.slugs as slug (slug)}
          <option value={slug}>{slug}</option>
        {/each}
        <!-- A ?category= in the URL that is not (or not yet) in the list is still shown. -->
        {#if catalog.params.category && !categories.slugs.includes(catalog.params.category)}
          <option value={catalog.params.category}>{catalog.params.category}</option>
        {/if}
      </select>
      <button
        type="button"
        class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
        onclick={() => categories.openManager()}
      >
        Manage
      </button>
    </div>
  </div>

  <div>
    <label for="sort" class="block text-xs font-medium text-slate-600">Sort by</label>
    <select
      id="sort"
      class="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      value={catalog.params.sort}
      onchange={(event) =>
        void catalog.update({ sort: event.currentTarget.value as SortParam | '' })}
    >
      {#each sortOptions as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </div>

  <div>
    <label for="page-size" class="block text-xs font-medium text-slate-600">Per page</label>
    <select
      id="page-size"
      class="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      value={String(catalog.params.pageSize)}
      onchange={(event) => void catalog.update({ pageSize: Number(event.currentTarget.value) })}
    >
      {#each pageSizes as size (size)}
        <option value={String(size)}>{size}</option>
      {/each}
    </select>
  </div>
</form>
