<script lang="ts">
  import type { Snippet } from 'svelte';
  import XIcon from '@lucide/svelte/icons/x';

  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } =
    $props();

  let dialog: HTMLDialogElement;

  $effect(() => {
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  });
</script>

<!-- Escape is handled natively by <dialog>; the click handler only adds backdrop-click-to-close. -->
<dialog
  bind:this={dialog}
  aria-labelledby="modal-title"
  class="m-auto w-full max-w-2xl rounded-lg bg-white p-0 shadow-xl backdrop:bg-slate-900/50"
  {onclose}
  onclick={(event) => {
    if (event.target === dialog) dialog.close();
  }}
>
  <div class="p-6">
    <div class="flex items-start justify-between gap-4">
      <h2 id="modal-title" class="text-lg font-semibold break-words text-slate-900">{title}</h2>
      <button
        type="button"
        class="inline-flex items-center rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
        aria-label="Close"
        title="Close"
        onclick={() => dialog.close()}
      >
        <XIcon size={16} aria-hidden="true" />
      </button>
    </div>
    <div class="mt-4">{@render children()}</div>
  </div>
</dialog>
