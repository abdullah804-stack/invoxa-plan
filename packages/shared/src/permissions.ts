/**
 * Role permissions from the plan's two tables. The API enforces these on every
 * route; the app hides what a role cannot do. Both read this one matrix.
 */

export type Role = 'owner' | 'staff' | 'viewer';

export type Action =
  | 'documents:read'
  | 'clients:read'
  | 'expenses:read'
  | 'projects:read'
  | 'reports:read'
  | 'csv:export'
  | 'activity:read'
  | 'drafts:create'
  | 'drafts:deleteOwn'
  | 'drafts:deleteAny'
  | 'clients:write'
  | 'savedItems:write'
  | 'expenses:write'
  | 'time:write'
  | 'documents:issue'
  | 'payments:write'
  | 'reminders:send'
  | 'documents:duplicate'
  | 'documents:convert'
  | 'creditNotes:apply'
  | 'ai:use'
  | 'documents:void'
  | 'lateFee:apply'
  | 'business:update'
  | 'brand:update'
  | 'numbering:update'
  | 'taxPresets:update'
  | 'lateFee:configure'
  | 'members:manage'
  | 'invites:manage'
  | 'business:delete';

const MATRIX: Record<Action, readonly Role[]> = {
  'documents:read': ['owner', 'staff', 'viewer'],
  'clients:read': ['owner', 'staff', 'viewer'],
  'expenses:read': ['owner', 'staff', 'viewer'],
  'projects:read': ['owner', 'staff', 'viewer'],
  'reports:read': ['owner', 'staff', 'viewer'],
  'csv:export': ['owner', 'staff', 'viewer'],
  'activity:read': ['owner', 'staff'],

  'drafts:create': ['owner', 'staff'],
  'drafts:deleteOwn': ['owner', 'staff'],
  'drafts:deleteAny': ['owner'],
  'clients:write': ['owner', 'staff'],
  'savedItems:write': ['owner', 'staff'],
  'expenses:write': ['owner', 'staff'],
  'time:write': ['owner', 'staff'],

  'documents:issue': ['owner', 'staff'],
  'payments:write': ['owner', 'staff'],
  'reminders:send': ['owner', 'staff'],
  'documents:duplicate': ['owner', 'staff'],
  'documents:convert': ['owner', 'staff'],
  'creditNotes:apply': ['owner', 'staff'],
  'ai:use': ['owner', 'staff'],

  'documents:void': ['owner'],
  'lateFee:apply': ['owner'],
  'business:update': ['owner'],
  'brand:update': ['owner'],
  'numbering:update': ['owner'],
  'taxPresets:update': ['owner'],
  'lateFee:configure': ['owner'],
  'members:manage': ['owner'],
  'invites:manage': ['owner'],
  'business:delete': ['owner'],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}

/** Every action a role may perform, for hiding UI it cannot use. */
export function allowedActions(role: Role): Action[] {
  return (Object.keys(MATRIX) as Action[]).filter((action) => can(role, action));
}
