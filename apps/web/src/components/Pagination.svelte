<script lang="ts">
  import type { PageMeta } from '@catalog/shared';
  import { pageItems } from '../lib/pagination.js';

  let { meta, onpage }: { meta: PageMeta; onpage: (page: number) => void } = $props();

  const button =
    'min-w-9 rounded-md border px-2.5 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50';
</script>

{#if meta.totalPages > 1}
  <nav class="mt-4 flex flex-wrap items-center gap-1" aria-label="Pagination">
    <button
      type="button"
      class="{button} border-slate-300 bg-white"
      disabled={meta.page <= 1}
      onclick={() => onpage(meta.page - 1)}
    >
      Previous
    </button>

    {#each pageItems(meta.page, meta.totalPages) as item, index (index)}
      {#if item === 'gap'}
        <span class="px-1 text-slate-500" aria-hidden="true">…</span>
      {:else}
        <button
          type="button"
          class="{button} {item === meta.page
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-300 bg-white'}"
          aria-label="Page {item}"
          aria-current={item === meta.page ? 'page' : undefined}
          onclick={() => onpage(item)}
        >
          {item}
        </button>
      {/if}
    {/each}

    <button
      type="button"
      class="{button} border-slate-300 bg-white"
      disabled={meta.page >= meta.totalPages}
      onclick={() => onpage(meta.page + 1)}
    >
      Next
    </button>
  </nav>
{/if}
