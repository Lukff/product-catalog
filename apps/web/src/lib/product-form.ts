import {
  createProductSchema,
  zodIssuesToDetails,
  type CreateProductInput,
  type ErrorDetail,
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
