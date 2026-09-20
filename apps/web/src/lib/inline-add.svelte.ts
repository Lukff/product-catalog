/** What the controller needs from the categories or brands store. */
export interface AddSource {
  /** Creates the entry and adds it to the shared list. Resolves to whether it worked. */
  add(input: string): Promise<boolean>;
  /** Why the last `add` failed. */
  readonly actionError: string | null;
}

/**
 * The "Add new…" flow of a select in the product form: an inline input that creates a category or
 * brand through its store, so the toolbar and the manage dialogs see it too. It never submits the
 * product and never touches what the form has selected; `confirm` and `useExisting` hand back the
 * value to select, or `null` when nothing should change.
 */
export class InlineAdd {
  adding = $state(false);
  draft = $state('');
  pending = $state(false);
  /** Why the add did not happen, shown under the input. */
  error = $state<string | null>(null);
  /** Set when the draft is already in the list, so the form can offer to select it instead. */
  duplicate = $state<string | null>(null);

  #source: AddSource;
  #existing: () => readonly string[];

  constructor(source: AddSource, existing: () => readonly string[]) {
    this.#source = source;
    this.#existing = existing;
  }

  open(): void {
    this.#reset();
    this.adding = true;
  }

  cancel(): void {
    this.#reset();
    this.adding = false;
  }

  /** Creates the entry. Returns the value to select, or `null` if it was refused. */
  async confirm(): Promise<string | null> {
    if (this.pending) return null;

    const value = this.draft.trim();
    this.error = null;
    this.duplicate = null;

    if (this.#existing().includes(value)) {
      this.error = `"${value}" already exists.`;
      this.duplicate = value;
      return null;
    }

    this.pending = true;
    try {
      if (!(await this.#source.add(value))) {
        this.error = this.#source.actionError ?? 'Could not add it';
        return null;
      }
    } finally {
      this.pending = false;
    }

    this.cancel();
    return value;
  }

  /** Closes the input and returns the existing entry the draft duplicated, if there is one. */
  useExisting(): string | null {
    const value = this.duplicate;
    this.cancel();
    return value;
  }

  #reset(): void {
    this.draft = '';
    this.error = null;
    this.duplicate = null;
  }
}
