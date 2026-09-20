<script lang="ts">
  import type { CreateProductInput } from '@catalog/shared';
  import { tick } from 'svelte';
  import { ApiError } from '../lib/api.js';
  import {
    detailsToFieldErrors,
    EMPTY_VALUES,
    validateProductForm,
    type FieldErrors,
    type FormField,
    type ProductFormValues,
  } from '../lib/product-form.js';

  let {
    onsubmit,
    oncancel,
  }: { onsubmit: (input: CreateProductInput) => Promise<void>; oncancel: () => void } = $props();

  interface FieldSpec {
    name: FormField;
    label: string;
    hint?: string;
    inputmode?: 'decimal' | 'numeric';
    wide?: boolean;
  }

  const fields: FieldSpec[] = [
    { name: 'title', label: 'Title', wide: true },
    { name: 'description', label: 'Description', wide: true },
    {
      name: 'category',
      label: 'Category',
      hint: 'Lowercase slug of an existing category, e.g. automotive',
    },
    { name: 'brand', label: 'Brand' },
    { name: 'sku', label: 'SKU' },
    { name: 'price', label: 'Price', inputmode: 'decimal' },
    { name: 'stock', label: 'Stock', inputmode: 'numeric' },
    { name: 'weight', label: 'Weight', inputmode: 'decimal' },
  ];

  let form: HTMLFormElement;
  let values = $state<ProductFormValues>({ ...EMPTY_VALUES });
  let errors = $state<FieldErrors>({});
  let formError = $state('');
  let pending = $state(false);

  async function focusFirstError() {
    await tick();
    form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (pending) return;
    formError = '';

    const result = validateProductForm(values);
    if (!result.ok) {
      errors = result.errors;
      await focusFirstError();
      return;
    }
    errors = {};

    pending = true;
    try {
      await onsubmit(result.input);
    } catch (cause) {
      if (cause instanceof ApiError) {
        // A server detail that names a field goes on that field; anything else is a banner.
        const { fields: fieldErrors, unmatched } = detailsToFieldErrors(cause.details);
        errors = fieldErrors;
        if (Object.keys(fieldErrors).length === 0) formError = cause.message;
        else if (unmatched.length > 0)
          formError = unmatched.map((detail) => detail.message).join('. ');
        await focusFirstError();
      } else {
        formError = 'Something went wrong. Please try again.';
      }
    } finally {
      pending = false;
    }
  }
</script>

<form bind:this={form} novalidate class="grid gap-4 sm:grid-cols-2" onsubmit={submit}>
  {#each fields as field (field.name)}
    <div class={field.wide ? 'sm:col-span-2' : ''}>
      <label for="field-{field.name}" class="block text-sm font-medium text-slate-700">
        {field.label}
      </label>
      {#if field.name === 'description'}
        <textarea
          id="field-{field.name}"
          rows="3"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          aria-invalid={errors[field.name] ? 'true' : undefined}
          aria-describedby={errors[field.name] ? `error-${field.name}` : undefined}
          bind:value={values[field.name]}></textarea>
      {:else}
        <input
          id="field-{field.name}"
          type="text"
          inputmode={field.inputmode}
          autocomplete="off"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          aria-invalid={errors[field.name] ? 'true' : undefined}
          aria-describedby={errors[field.name] ? `error-${field.name}` : undefined}
          bind:value={values[field.name]}
        />
      {/if}
      {#if field.hint && !errors[field.name]}
        <p class="mt-1 text-xs text-slate-500">{field.hint}</p>
      {/if}
      {#if errors[field.name]}
        <p id="error-{field.name}" class="mt-1 text-sm text-red-700">{errors[field.name]}</p>
      {/if}
    </div>
  {/each}

  {#if formError}
    <p
      role="alert"
      class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:col-span-2"
    >
      {formError}
    </p>
  {/if}

  <div class="flex justify-end gap-3 sm:col-span-2">
    <button
      type="button"
      class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
      onclick={oncancel}
    >
      Cancel
    </button>
    <button
      type="submit"
      class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      disabled={pending}
    >
      {pending ? 'Creating…' : 'Create product'}
    </button>
  </div>
</form>
