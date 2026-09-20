export type PageItem = number | 'gap';

/**
 * Page numbers for a numbered pager: the first and last page and the current page with its
 * neighbours, with `'gap'` standing in for the pages skipped between them.
 */
export function pageItems(current: number, total: number): PageItem[] {
  if (total < 1) return [];

  const shown = [
    ...new Set([1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total)),
  ].sort((a, b) => a - b);

  const items: PageItem[] = [];
  shown.forEach((page, index) => {
    const previous = shown[index - 1];
    if (previous !== undefined) {
      // A single skipped page is shown rather than replaced by a gap that is no shorter.
      if (page - previous === 2) items.push(previous + 1);
      else if (page - previous > 2) items.push('gap');
    }
    items.push(page);
  });
  return items;
}
