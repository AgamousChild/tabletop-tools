import type { AnyFieldApi } from '@tanstack/form-core'
import type { ZodTypeAny } from 'zod'

const inputBase =
  'w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 disabled:opacity-50'

const selectBase =
  'bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400 disabled:opacity-50'

interface ZodFormFieldProps {
  field: AnyFieldApi
  /** Zod schema for this field — used to choose the input type. */
  fieldSchema: ZodTypeAny
  label: string
  description?: string
  placeholder?: string
}

/**
 * Renders a single form field driven by its Zod schema type.
 *
 * Supported types:
 *   ZodString  → <input type="text">
 *   ZodNumber  → <input type="number">
 *   ZodBoolean → <input type="checkbox">
 *   ZodEnum    → <select> with one <option> per enum value
 *   ZodOptional → unwraps and delegates to the inner type
 */
export function ZodFormField({
  field,
  fieldSchema,
  label,
  description,
  placeholder,
}: ZodFormFieldProps) {
  const errors = field.state.meta.errors as unknown[]
  const firstError = errors[0]
  const errorText =
    firstError != null
      ? typeof firstError === 'string'
        ? firstError
        : typeof firstError === 'object' && firstError !== null && 'message' in firstError
          ? String((firstError as { message: unknown }).message)
          : String(firstError)
      : null

  const innerSchema = resolveInner(fieldSchema)
  const typeName: string = (innerSchema as { _def?: { typeName?: string } })._def?.typeName ?? ''
  const fieldId = `field-${String(field.name)}`

  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="block text-xs text-slate-400 font-medium">
        {label}
      </label>

      {typeName === 'ZodBoolean' ? (
        <div className="flex items-center gap-2">
          <input
            id={fieldId}
            type="checkbox"
            checked={Boolean(field.state.value)}
            onChange={(e) => field.handleChange(e.target.checked)}
            onBlur={field.handleBlur}
            className="h-4 w-4 accent-amber-400"
          />
          {description && <span className="text-xs text-slate-500">{description}</span>}
        </div>
      ) : typeName === 'ZodEnum' ? (
        <select
          id={fieldId}
          value={String(field.state.value ?? '')}
          onChange={(e) => field.handleChange(e.target.value)}
          onBlur={field.handleBlur}
          className={selectBase}
        >
          {getEnumValues(innerSchema).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : typeName === 'ZodNumber' ? (
        <input
          id={fieldId}
          type="number"
          value={field.state.value == null ? '' : String(field.state.value)}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value)
            field.handleChange(isNaN(parsed) ? undefined : parsed)
          }}
          onBlur={field.handleBlur}
          placeholder={placeholder}
          className={inputBase}
        />
      ) : (
        /* ZodString and everything else */
        <input
          id={fieldId}
          type="text"
          value={String(field.state.value ?? '')}
          onChange={(e) => field.handleChange(e.target.value)}
          onBlur={field.handleBlur}
          placeholder={placeholder}
          className={inputBase}
        />
      )}

      {typeName !== 'ZodBoolean' && description && (
        <p className="text-xs text-slate-500">{description}</p>
      )}

      {errorText && (
        <p role="alert" className="text-xs text-red-400">
          {errorText}
        </p>
      )}
    </div>
  )
}

/** Unwrap ZodOptional/ZodNullable to get at the inner type. */
function resolveInner(schema: ZodTypeAny): ZodTypeAny {
  const typeName = (schema as { _def?: { typeName?: string } })._def?.typeName
  if (typeName === 'ZodOptional' || typeName === 'ZodNullable') {
    return resolveInner((schema as { _def: { innerType: ZodTypeAny } })._def.innerType)
  }
  return schema
}

/** Extract the values array from a ZodEnum schema. */
function getEnumValues(schema: ZodTypeAny): string[] {
  return (schema as { _def?: { values?: string[] } })._def?.values ?? []
}
