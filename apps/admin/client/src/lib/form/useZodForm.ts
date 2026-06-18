import { useForm } from '@tanstack/react-form'
import type { infer as ZodInfer, ZodObject, ZodRawShape } from 'zod'

/**
 * Wraps `useForm` from @tanstack/react-form and wires a Zod object schema into
 * `validators.onSubmit` so the schema drives both server and client validation.
 *
 * TanStack Form v1 supports the Standard Schema interface natively (Zod 3.24+
 * implements `~standard`), so no adapter is needed — pass the schema directly.
 *
 * The `validators.onSubmit` typing fights TypeScript when expressed generically
 * so we cast through `unknown`. The runtime behaviour is correct: Standard Schema
 * objects are detected via `~standard` at runtime by `@tanstack/form-core`.
 *
 * @example
 * const form = useZodForm(mySchema, {
 *   defaultValues: { name: '', count: 0 },
 *   onSubmit: (values) => save(values),
 * })
 */
export function useZodForm<TSchema extends ZodObject<ZodRawShape>>(
  schema: TSchema,
  options: {
    defaultValues: ZodInfer<TSchema>
    onSubmit: (values: ZodInfer<TSchema>) => void | Promise<void>
  },
) {
  return useForm({
    defaultValues: options.defaultValues as Record<string, unknown>,
    // Cast required: TanStack Form's generic constraint for validators.onSubmit
    // doesn't accept ZodObject directly even though it supports Standard Schema
    // at runtime. The schema is detected via the ~standard symbol.
    validators: {
      onSubmit: schema as unknown as undefined,
    },
    onSubmit: async ({ value }) => options.onSubmit(value as ZodInfer<TSchema>),
  })
}
