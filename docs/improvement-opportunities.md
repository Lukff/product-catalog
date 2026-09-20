# Improvement opportunities

Small improvements found during reviews that are not part of any backlog item. This
file records **what could be better and why**; it does not schedule work. If one of
these is picked up, it moves to `backlog.md` as a proper item.

- **Say "Could not reach the server" when the API is down.** With the dev proxy, an
  unreachable API answers `502 Bad Gateway`, not a failed `fetch`, so `lib/api.ts`
  treats it as a server response and shows the status text. Users see "Bad Gateway"
  in the create and edit form banner, the delete panel and the detail refresh notice.
  Mapping `502`, `503` and `504` to the same "Could not reach the server" message
  (the `NETWORK_ERROR` case) in `apps/web/src/lib/api.ts` would fix all of them at
  once. Found while browser-checking B-07 and B-10.
- **Improve the design of the page.** The UI is functional but plain: a bare
  "Product Catalog" heading, default slate Tailwind styling, and a table with the
  toolbar above it. Nothing has had a dedicated visual pass yet. Candidates to look at
  are the page header and layout, the table's density and hierarchy, the modal and its
  form, the empty and error states, the responsive layout on narrow screens, and a
  favicon (the browser requests one and gets a `404` on every load). A design system
  would be the place to start, so the visual pass has one set of tokens to follow.
- **Batch editing.** Products can only be edited or deleted one at a time through the
  modal. Selecting several rows in the table and applying one change to all of them
  (set the category, adjust the price, toggle the status, or delete) would save
  repetitive work on a larger catalog. It needs a selection column in the table, a
  bulk-action bar, and a batch endpoint in the API that applies the change in a single
  transaction, so a partial failure leaves nothing half-updated.
- **Support for images.** Products have no picture, so the table and the detail view
  are text only. Adding one image per product (an upload or a URL) would make the
  catalog much easier to scan. It touches the data model (an image reference on the
  product), the shared Zod contract, the API (upload handling, file size and type
  validation, and where the files are stored) and the SPA (a thumbnail in the table,
  a preview in the form and detail view, and a placeholder when there is none).
