<script lang="ts">
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import Modal from '../components/Modal.svelte';
  import { categories } from '../lib/stores/categories.svelte.js';

  let slug = $state('');

  async function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    if (await categories.add(slug)) slug = '';
  }
</script>

{#if categories.managerOpen}
  <Modal title="Manage categories" onclose={() => categories.closeManager()}>
    <form class="flex items-end gap-3" {onsubmit}>
      <div class="flex-1">
        <label for="new-category" class="block text-xs font-medium text-slate-600">
          New category
        </label>
        <input
          id="new-category"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="home-decor"
          autocomplete="off"
          bind:value={slug}
        />
      </div>
      <button
        type="submit"
        class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        disabled={categories.pending}
      >
        Add
      </button>
    </form>

    {#if categories.actionError}
      <p
        role="alert"
        class="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      >
        {categories.actionError}
      </p>
    {/if}

    {#if categories.status === 'error'}
      <p role="alert" class="mt-4 text-sm text-red-800">Could not load the categories.</p>
    {:else if categories.slugs.length === 0 && categories.status === 'ready'}
      <p class="mt-4 text-sm text-slate-600">There are no categories yet.</p>
    {:else}
      <ul class="mt-4 divide-y divide-slate-200 rounded-md border border-slate-200">
        {#each categories.slugs as existing (existing)}
          <li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span class="break-all text-slate-900">{existing}</span>
            <button
              type="button"
              class="inline-flex items-center rounded-md border border-slate-300 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-60"
              aria-label={`Remove ${existing}`}
              title={`Remove ${existing}`}
              disabled={categories.pending}
              onclick={() => void categories.remove(existing)}
            >
              <Trash2Icon size={14} aria-hidden="true" />
            </button>
          </li>
        {/each}
      </ul>
      <p class="mt-3 text-xs text-slate-500">
        A category can only be removed once no product uses it.
      </p>
    {/if}
  </Modal>
{/if}
