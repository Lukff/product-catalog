<script lang="ts">
  import type { Product } from '@catalog/shared';
  import type { ApiError } from '../lib/api.js';
  import type { DeleteStatus } from '../lib/stores/product-dialog.svelte.js';

  let {
    product,
    status,
    error,
    onconfirm,
    oncancel,
  }: {
    product: Product;
    status: DeleteStatus;
    error: ApiError | null;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  let cancelButton: HTMLButtonElement;

  $effect(() => {
    cancelButton.focus();
  });
</script>

<div>
  <p class="text-sm text-slate-700">
    Delete <strong class="break-words">{product.title}</strong> ({product.sku})? This removes the
    product permanently and cannot be undone.
  </p>

  {#if status === 'error'}
    <p
      role="alert"
      class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      Could not delete this product: {error?.message}
    </p>
  {/if}

  <div class="mt-6 flex justify-end gap-3">
    <button
      bind:this={cancelButton}
      type="button"
      class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
      disabled={status === 'pending'}
      onclick={oncancel}
    >
      Cancel
    </button>
    <button
      type="button"
      class="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
      disabled={status === 'pending'}
      onclick={onconfirm}
    >
      {status === 'pending' ? 'Deleting…' : 'Delete product'}
    </button>
  </div>
</div>
