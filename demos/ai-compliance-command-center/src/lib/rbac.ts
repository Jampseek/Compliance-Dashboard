// Simulated Azure Entra ID + RBAC layer.
// In production these roles map to Entra ID App Roles / security groups and the
// dashboard would receive them as claims in the access token. Here we model the
// three personas from the architecture's Human Oversight + Governance zones.

export type Role = 'analyst' | 'investigator' | 'executive'

export interface Principal {
  name: string
  email: string
  role: Role
}

export interface RoleDefinition {
  role: Role
  label: string
  description: string
  /** Routes this role is permitted to open. */
  permissions: string[]
}

export const ROLES: RoleDefinition[] = [
  {
    role: 'analyst',
    label: 'Compliance Analyst',
    description: 'Reviews triaged alerts, clears false positives, escalates to cases.',
    permissions: ['/screening', '/media', '/alerts', '/analyst', '/cases', '/edd', '/kyc', '/audit', '/customer-risk-profiles'],
  },
  {
    role: 'investigator',
    label: 'Case Investigator',
    description: 'Investigates escalated cases, drafts SARs, manages the approval gate.',
    permissions: ['/screening', '/media', '/alerts', '/analyst', '/cases', '/edd', '/kyc', '/audit', '/customer-risk-profiles'],
  },
  {
    role: 'executive',
    label: 'Executive / MLRO',
    description: 'Oversees program KPIs and the immutable audit trail.',
    permissions: ['/executive', '/kyc', '/audit'],
  },
]

export const PRINCIPALS: Record<Role, Principal> = {
  analyst: { name: 'Amara Okafor', email: 'a.okafor@globalbank.example', role: 'analyst' },
  investigator: { name: 'Daniel Reyes', email: 'd.reyes@globalbank.example', role: 'investigator' },
  executive: { name: 'Priya Nair', email: 'p.nair@globalbank.example', role: 'executive' },
}

export function can(role: Role, route: string): boolean {
  const def = ROLES.find((r) => r.role === role)
  return !!def && def.permissions.includes(route)
}
