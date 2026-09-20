<script lang="ts">
  import { tick } from 'svelte';
  import type { InlineAdd } from '../lib/inline-add.svelte.js';

  /** Never a real entry: none of these can be a valid slug or brand name that the list holds. */
  const ADD_NEW = '\u0000add-new';

  let {
    id,
    value = $bindable(),
    options,
    noun,
    placeholder,
    inputPlaceholder,
    inline,
    invalid = false,
    describedby,
  }: {
    id: string;
    value: string;
    options: readonly string[];
    /** Singular, lowercase: "category" or "brand". */
    noun: string;
    placeholder: string;
    inputPlaceholder: string;
    inline: InlineAdd;
    invalid?: boolean;
    describedby?: string | undefined;
  } = $props();

  let input = $state<HTMLInputElement>();

  async function onchange(event: Event & { currentTarget: HTMLSelectElement }) {
    const select = event.currentTarget;
    if (select.value !== ADD_NEW) {
      value = select.value;
      return;
    }
    // Opening the input must not change the selection, so put the old value back.
    select.value = value;
    inline.open();
    await tick();
    input?.focus();
  }

  async function confirm() {
    const added = await inline.confirm();
    if (added !== null) value = added;
  }

  function useExisting() {
    const existing = inline.useExisting();
    if (existing !== null) value = existing;
  }

  // Enter confirms the add. The input sits inside the product form, so it must not submit that.
  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void confirm();
    } else if (event.key === 'Escape' && inline.adding) {
      // The modal closes on Escape; closing only the input first is what a user expects.
      event.preventDefault();
      event.stopPropagation();
      inline.cancel();
    }
  }
</script>

<select
  {id}
  class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
  aria-invalid={invalid ? 'true' : undefined}
  aria-describedby={describedby}
  {value}
  {onchange}
>
  <option value="">{placeholder}</option>
  {#each options as option (option)}
    <option value={option}>{option}</option>
  {/each}
  <option value={ADD_NEW}>Add new {noun}…</option>
</select>

{#if inline.adding}
  <div class="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
    <div class="flex gap-2">
      <input
        bind:this={input}
        bind:value={inline.draft}
        type="text"
        autocomplete="off"
        aria-label={`New ${noun}`}
        aria-invalid={inline.error ? 'true' : undefined}
        aria-describedby={inline.error ? `${id}-add-error` : undefined}
        placeholder={inputPlaceholder}
        class="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
        {onkeydown}
      />
      <button
        type="button"
        class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        disabled={inline.pending}
        onclick={() => void confirm()}
      >
        {inline.pending ? 'Adding…' : 'Add'}
      </button>
      <button
        type="button"
        class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
        onclick={() => inline.cancel()}
      >
        Cancel
      </button>
    </div>
    {#if inline.error}
      <p id="{id}-add-error" role="alert" class="mt-1 text-sm text-red-700">
        {inline.error}
        {#if inline.duplicate}
          <button type="button" class="ml-1 underline" onclick={useExisting}>Use it</button>
        {/if}
      </p>
    {/if}
  </div>
{/if}
