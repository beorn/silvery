/**
 * Form + FormField Components
 *
 * Layout wrappers for form inputs. Form provides vertical grouping and
 * an optional submit handler. FormField provides label, error display,
 * and consistent spacing between fields.
 *
 * Usage:
 * ```tsx
 * <Form onSubmit={handleSubmit}>
 *   <FormField label="Name" error={errors.name}>
 *     <TextInput value={name} onChange={setName} />
 *   </FormField>
 *   <FormField label="Email">
 *     <TextInput value={email} onChange={setEmail} />
 *   </FormField>
 * </Form>
 * ```
 */
import React from "react"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"

// =============================================================================
// Types
// =============================================================================

export interface FormProps {
  /** Called when Enter is pressed within the form (optional) */
  onSubmit?: () => void
  /** Gap between form fields (default: 1) */
  gap?: number
  /** Form children (typically FormField components) */
  children: React.ReactNode
}

export interface FormFieldProps {
  /** Field label text */
  label: string
  /** Error message to display below the input */
  error?: string
  /** Optional description text below the label */
  description?: string
  /** Whether the field is required (shows * indicator) */
  required?: boolean
  /** Field input children */
  children: React.ReactNode
}

// =============================================================================
// Components
// =============================================================================

/**
 * Vertical form layout container.
 *
 * Groups FormField children with consistent spacing. The optional `onSubmit`
 * callback is provided for parent-level form submission logic.
 */
export function Form({ onSubmit: _onSubmit, gap = 1, children }: FormProps): React.ReactElement {
  return (
    <Box flexDirection="column" gap={gap}>
      {children}
    </Box>
  )
}

/**
 * Form field wrapper providing label, error display, and spacing.
 *
 * Renders a label above the input with optional required indicator,
 * description text, and error message in `$error` color.
 */
export function FormField({ label, error, description, required, children }: FormFieldProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="$muted" bold>
        {label}
        {required && <Text color="$error"> *</Text>}
      </Text>
      {description && <Text color="$disabledfg">{description}</Text>}
      <Box>{children}</Box>
      {error && <Text color="$error">{error}</Text>}
    </Box>
  )
}
