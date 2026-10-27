import { v4 as uuidv4 } from 'uuid';
import { UserRole, type FieldDefinition } from '../../lib/db/serverTypes';
import { persistFieldDefinition } from '../../lib/db/referenceDataRepo';
import { state } from '../../server/state';
import { addMasterDataHistory } from '../../server/services/history';

type Result<T> = { status: number; body: T };
type ErrorBody = { error: string };
const inputTypes = new Set(['text', 'number', 'dropdown', 'date', 'textarea']);
const masterDataEntities = new Set(['departments', 'costCenters', 'businessUnits', 'branches', 'projectCodes', 'vendors']);

function getUser(userId: string | null) {
  return state.users.find((user) => user.id === userId || user.entra_object_id === userId || user.user_principal_name === userId);
}

export const validateFieldDefinitionBody = (body: Record<string, unknown>, existing: FieldDefinition[], editingId?: string): string | null => {
  if (body.key !== undefined) {
    const key = String(body.key).trim();
    if (!key) return 'Field key is required.';
    if (!/^[a-z][a-z0-9_]*$/.test(key)) return 'Field key must be lowercase letters, numbers, and underscores, starting with a letter.';
    if (existing.some((field) => field.id !== editingId && field.entity === (body.entity || existing.find((entry) => entry.id === editingId)?.entity) && field.key === key)) return 'A field with this key already exists for this form.';
  }
  if (body.label !== undefined && !String(body.label).trim()) return 'Field label is required.';
  if (body.input_type !== undefined && !inputTypes.has(String(body.input_type))) return `Input type must be one of: ${[...inputTypes].join(', ')}.`;
  if (body.master_data_entity !== undefined && body.master_data_entity !== null && !masterDataEntities.has(String(body.master_data_entity))) return `Master data source must be one of: ${[...masterDataEntities].join(', ')}.`;
  return body.display_order !== undefined && typeof body.display_order !== 'number' ? 'Display order must be a number.' : null;
};

export const validateRequiredCustomFields = (entity: FieldDefinition['entity'], customFields: Record<string, string> | undefined): string | null => {
  const required = state.fieldDefinitions.find((field) => field.entity === entity && field.active && field.required && !(entity === 'mom' && field.key === 'type_of_account') && !(customFields && String(customFields[field.key] ?? '').trim()));
  if (required) return `${required.label} is required.`;
  const other = state.fieldDefinitions.find((field) => field.entity === entity && field.active && !(entity === 'mom' && field.key === 'type_of_account') && field.allow_other && customFields && String(customFields[field.key] ?? '').trim() === 'Other' && !String(customFields[`${field.key}_other`] ?? '').trim());
  return other ? `Please specify ${other.label.toLowerCase()}.` : null;
};

export function listFieldDefinitions(userId: string | null, entity?: string): Result<FieldDefinition[] | ErrorBody> {
  if (!getUser(userId)) return { status: 401, body: { error: 'Unauthorized' } };
  const fields = entity ? state.fieldDefinitions.filter((field) => field.entity === entity) : state.fieldDefinitions;
  return { status: 200, body: [...fields].sort((left, right) => left.display_order - right.display_order) };
}

export async function createFieldDefinition(userId: string | null, body: Record<string, unknown>): Promise<Result<FieldDefinition | ErrorBody>> {
  const user = getUser(userId);
  if (!user || user.role !== UserRole.ADMIN) return { status: 403, body: { error: 'Forbidden' } };
  if (!body.key || !body.label || !body.input_type || !body.entity) return { status: 400, body: { error: 'entity, key, label, and input_type are required.' } };
  const validationError = validateFieldDefinitionBody(body, state.fieldDefinitions);
  if (validationError) return { status: 400, body: { error: validationError } };
  const now = new Date().toISOString();
  const definition: FieldDefinition = { id: uuidv4(), entity: body.entity as FieldDefinition['entity'], key: String(body.key).trim(), label: String(body.label).trim(), input_type: body.input_type as FieldDefinition['input_type'], required: !!body.required, active: body.active !== undefined ? !!body.active : true, default_value: body.default_value ? String(body.default_value) : undefined, display_order: typeof body.display_order === 'number' ? body.display_order : state.fieldDefinitions.length + 1, options: Array.isArray(body.options) ? body.options.map(String) : undefined, master_data_entity: body.master_data_entity as FieldDefinition['master_data_entity'], allow_other: !!body.allow_other, applicableClaimTypes: Array.isArray(body.applicableClaimTypes) ? body.applicableClaimTypes as FieldDefinition['applicableClaimTypes'] : undefined, validation: body.validation as FieldDefinition['validation'], created_at: now, updated_at: now };
  state.fieldDefinitions.push(definition);
  try { await persistFieldDefinition(definition); } catch (error) { console.error('[db] Could not persist new field definition to Postgres:', error); }
  return { status: 200, body: definition };
}

export async function updateFieldDefinition(userId: string | null, id: string, body: Record<string, unknown>): Promise<Result<FieldDefinition | ErrorBody>> {
  const user = getUser(userId);
  if (!user || user.role !== UserRole.ADMIN) return { status: 403, body: { error: 'Forbidden' } };
  const definition = state.fieldDefinitions.find((field) => field.id === id);
  if (!definition) return { status: 404, body: { error: 'Field definition not found' } };
  const validationError = validateFieldDefinitionBody(body, state.fieldDefinitions, definition.id);
  if (validationError) return { status: 400, body: { error: validationError } };
  (['key', 'label', 'input_type', 'required', 'active', 'default_value', 'display_order', 'options', 'master_data_entity', 'allow_other', 'applicableClaimTypes', 'validation'] as const).forEach((field) => {
    const value = body[field];
    if (value !== undefined && JSON.stringify(definition[field]) !== JSON.stringify(value)) {
      addMasterDataHistory('field-definitions', definition.id, field, JSON.stringify(definition[field] ?? null), JSON.stringify(value), user.id);
      (definition as unknown as Record<string, unknown>)[field] = value;
    }
  });
  definition.updated_at = new Date().toISOString();
  try { await persistFieldDefinition(definition); } catch (error) { console.error('[db] Could not persist field definition changes to Postgres:', error); }
  return { status: 200, body: definition };
}
