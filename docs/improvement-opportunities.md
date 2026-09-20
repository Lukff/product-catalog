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
