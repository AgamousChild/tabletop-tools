# apps/new-meta/client/src/pages/Admin.tsx

> Admin CSV import page — upload tournament results and trigger Glicko-2 computation.

## Prompt

Admin-only page for importing tournament data. Form fields: CSV text area, format selector (BCP/Tabletop Admiral/Generic), event name, event date, meta window. Submit calls `trpc.admin.import.useMutation()`. Also has "Recompute Glicko" button calling `trpc.admin.recomputeGlicko.useMutation()`. Shows import results (imported count, errors, players updated).

Note: the adminProcedure on the server handles auth — the client just calls the mutation and shows errors if unauthorized.
