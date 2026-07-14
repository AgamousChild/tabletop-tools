/**
 * sync.ts — DEPRECATED
 *
 * The v1 IndexedDB→server sync helpers have been removed. List CRUD now goes
 * directly through the listV2 tRPC router (see useListsV2.ts).
 *
 * One-time migration from IndexedDB to the server is handled by
 * migrateIndexedDbLists.ts, which runs once per device on first load.
 *
 * This file is kept as a named module so that any lingering import of
 * `../lib/sync` fails loudly (missing exports) rather than silently.
 */
export {}
