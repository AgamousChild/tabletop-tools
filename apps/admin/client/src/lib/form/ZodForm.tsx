import type { ReactNode } from 'react'
import type { infer as ZodInfer, ZodObject, ZodRawShape } from 'zod'

import { useZodForm } from './useZodForm'
import { ZodFormField } from './ZodFormField'

/**
 * Per-field display configuration.  All fields are optional — sensible defaults
 * are derived from the field name and Zod type when not provided.
 */
export interface FieldConfig {
  label?: string
  description?: string
  placeholder?: string
}

interface ZodFormProps<TSchema extends ZodObject<ZodRawShape>> {
  schema: TSchema
  defaultValues: ZodInfer<TSchema>
  onSubmit: (values: ZodInfer<TSchema>) => void | Promise<void>
  /** Override display options per field key. */
  fieldConfig?: Partial<Record<keyof ZodInfer<TSchema> & string, FieldConfig>>
  submitLabel?: string
  /** Whether a parent mutation is in-flight (disables the submit button). */
  isPending?: boolean
  /** Optional extra content rendered after the fields, before the submit button. */
  footer?: ReactNode
}

/**
 * Full-form wrapper: drop in a Zod schema + onSubmit, get a rendered form.
 *
 * Fields are rendered in schema key order.  Use `fieldConfig` to customise
 * labels, placeholders and descriptions.  No hand-rolled input/label/error
 * markup needed — the field renderer derives those from the Zod type.
 *
 * @example
 * <ZodForm
 *   schema={addIngestSourceSchema}
 *   defaultValues={{ name: '', url: '', type: 'youtube' }}
 *   onSubmit={(values) => addSource.mutate(values)}
 *   isPending={addSource.isPending}
 * />
 */
export function ZodForm<TSchema extends ZodObject<ZodRawShape>>({
  schema,
  defaultValues,
  onSubmit,
  fieldConfig,
  submitLabel = 'Submit',
  isPending = false,
  footer,
}: ZodFormProps<TSchema>) {
  const form = useZodForm(schema, { defaultValues, onSubmit })

  const fieldKeys = Object.keys(schema.shape) as Array<keyof ZodInfer<TSchema> & string>

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
      className="space-y-4"
    >
      {fieldKeys.map((key) => {
        const cfg = fieldConfig?.[key] ?? {}
        return (
          <form.Field key={key} name={key as string}>
            {(field) => (
              <ZodFormField
                field={field}
                fieldSchema={schema.shape[key]}
                label={cfg.label ?? labelFromKey(key)}
                description={cfg.description}
                placeholder={cfg.placeholder}
              />
            )}
          </form.Field>
        )
      })}

      {footer}

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <button
            type="submit"
            disabled={isPending || isSubmitting}
            className="px-4 py-1.5 bg-amber-400 text-slate-950 rounded font-medium text-sm hover:bg-amber-300 disabled:opacity-50"
          >
            {isPending || isSubmitting ? 'Saving...' : submitLabel}
          </button>
        )}
      </form.Subscribe>
    </form>
  )
}

/** Convert a camelCase key to Title Case label. */
function labelFromKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}
