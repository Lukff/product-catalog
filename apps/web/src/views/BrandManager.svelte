<script lang="ts">
  import Modal from '../components/Modal.svelte';
  import { brands } from '../lib/stores/brands.svelte.js';

  let name = $state('');

  async function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    if (await brands.add(name)) name = '';
  }
</script>

{#if brands.managerOpen}
  <Modal title="Manage brands" onclose={() => brands.closeManager()}>
    <form class="flex items-end gap-3" {onsubmit}>
      <div class="flex-1">
        <label for="new-brand" class="block text-xs font-medium text-slate-600">New brand</label>
        <input
          id="new-brand"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="Acme Corp"
          autocomplete="off"
          bind:value={name}
        />
      </div>
      <button
        type="submit"
        class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        disabled={brands.pending}
      >
        Add
      </button>
    </form>

    {#if brands.actionError}
      <p
        role="alert"
        class="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      >
        {brands.actionError}
      </p>
    {/if}

    {#if brands.status === 'error'}
      <p role="alert" class="mt-4 text-sm text-red-800">Could not load the brands.</p>
    {:else if brands.names.length === 0 && brands.status === 'ready'}
      <p class="mt-4 text-sm text-slate-600">There are no brands yet.</p>
    {:else}
      <ul class="mt-4 divide-y divide-slate-200 rounded-md border border-slate-200">
        {#each brands.names as existing (existing)}
          <li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span class="break-all text-slate-900">{existing}</span>
            <button
              type="button"
              class="rounded-md border border-slate-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
              aria-label={`Remove ${existing}`}
              disabled={brands.pending}
              onclick={() => void brands.remove(existing)}
            >
              Remove
            </button>
          </li>
        {/each}
      </ul>
      <p class="mt-3 text-xs text-slate-500">
        A brand can only be removed once no product uses it.
      </p>
    {/if}
  </Modal>
{/if}
