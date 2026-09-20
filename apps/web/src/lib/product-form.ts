import {
  createProductSchema,
  zodIssuesToDetails,
  type CreateProductInput,
  type ErrorDetail,
  type PatchProductInput,
  type Product,
} from '@catalog/shared';

export const FORM_FIELDS = [
  'title',
  'description',
  'category',
  'brand',
  'sku',
  'price',
  'stock',
  'weight',
] as const;

export type FormField = (typeof FORM_FIELDS)[number];
/** Every input is a string while the user types; `validateProductForm` converts. */
export type ProductFormValues = Record<FormField, string>;
export type FieldErrors = Partial<Record<FormField, string>>;

export const EMPTY_VALUES: ProductFormValues = {
  title: '',
  description: '',
  category: '',
  brand: '',
  sku: '',
  price: '',
  stock: '',
  weight: '',
};

const NUMERIC_FIELDS = ['price', 'stock', 'weight'] as const;

export type FormResult =
  { ok: true; input: CreateProductInput } | { ok: false; errors: FieldErrors };

function isFormField(path: string): path is FormField {
  return (FORM_FIELDS as readonly string[]).includes(path);
}

/**
 * Checks the form with the same Zod schema the API uses, so messages match. Blank and
 * non-numeric inputs are caught first because Zod's own message for them ("expected number")
 * is not useful in a form.
 */
export function validateProductForm(values: ProductFormValues): FormResult {
  const errors: FieldErrors = {};
  const raw: Record<string, unknown> = { ...values };

  if (values.category.trim() === '') errors.category = 'is required';
  if (values.brand.trim() === '') errors.brand = 'is required';
  for (const field of NUMERIC_FIELDS) {
    const text = values[field].trim();
    if (text === '') errors[field] = 'is required';
    else if (!Number.isFinite(Number(text))) errors[field] = 'must be a number';
    else raw[field] = Number(text);
  }

  const parsed = createProductSchema.safeParse(raw);
  if (parsed.success && Object.keys(errors).length === 0) return { ok: true, input: parsed.data };

  if (!parsed.success) {
    for (const { path, message } of zodIssuesToDetails(parsed.error)) {
      if (isFormField(path) && errors[path] === undefined) errors[path] = message;
    }
  }
  return { ok: false, errors };
}

/** Splits an API error's `details` into per-field messages and the ones no field can show. */
export function detailsToFieldErrors(details: ErrorDetail[]): {
  fields: FieldErrors;
  unmatched: ErrorDetail[];
} {
  const fields: FieldErrors = {};
  const unmatched: ErrorDetail[] = [];

  for (const detail of details) {
    if (!isFormField(detail.path)) unmatched.push(detail);
    else if (fields[detail.path] === undefined) fields[detail.path] = detail.message;
  }
  return { fields, unmatched };
}

/** The form's initial values for editing: every field as the string a user would have typed. */
export function valuesFromProduct(product: Product): ProductFormValues {
  return {
    title: product.title,
    description: product.description,
    category: product.category,
    brand: product.brand,
    sku: product.sku,
    price: String(product.price),
    stock: String(product.stock),
    weight: String(product.weight),
  };
}

/** The fields of `input` that differ from the stored product; `{}` when nothing changed. */
export function changedFields(original: Product, input: CreateProductInput): PatchProductInput {
  const patch: Record<string, unknown> = {};
  for (const field of FORM_FIELDS) {
    if (original[field] !== input[field]) patch[field] = input[field];
  }
  // Every key is a field of the patch schema and every value came from the validated input.
  return patch as PatchProductInput;
}

/**
 * The slugs the category select offers. `original` is the category the form opened with (empty
 * when creating); it stays selectable even if the list lacks it, so opening Edit never changes it.
 */
export function categoryOptions(slugs: readonly string[], original: string): string[] {
  return original !== '' && !slugs.includes(original) ? [original, ...slugs] : [...slugs];
}

/** The names the brand select offers, with the same keep-the-original rule as the categories. */
export function brandOptions(names: readonly string[], original: string): string[] {
  return categoryOptions(names, original);
}

/**
 * The hint shown under a select whose list is not usable: it failed to load, or is empty. `noun` is
 * the plural ("categories", "brands"); the empty hint points at the toolbar's Manage button.
 */
export function optionsHint(
  status: 'loading' | 'ready' | 'error',
  count: number,
  noun: string,
): string {
  if (status === 'error') return `Could not load the ${noun}.`;
  if (status === 'ready' && count === 0)
    return `No ${noun} yet. Add one with Manage in the toolbar.`;
  return '';
}
