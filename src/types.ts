export type ServiceStatus = 'O' | 'C' | 'R' | 'N/A';
export type AppRole = 'platform_admin' | 'internal_manager' | 'technician' | 'customer_admin' | 'customer_user';
export type ModuleKey = 'home' | 'service' | 'inventory' | 'files' | 'equipment';

export interface ChecklistSection {
  title: string;
  items: string[];
}

export type ChecklistMap = Record<string, [string, string[]][]>;

export interface ChecklistResult {
  status: ServiceStatus | '';
  comment: string;
}

export interface PartLine {
  inventoryId?: string;
  partNumber: string;
  description: string;
  quantity: number;
}

export interface ServiceSheet {
  id: string;
  reference: string;
  customer: string;
  date: string;
  make: string;
  kind: string;
  model: string;
  vin: string;
  hours: string;
  technician: string;
  interval: string;
  nextDue: string;
  checklist: Record<string, ChecklistResult>;
  measurements: Record<string, string>;
  valveTests: Record<string, { status: 'pass' | 'fail' | ''; repair: string }>;
  parts: PartLine[];
  notes: string;
  workStatus: string;
  notified: string;
  followUp: string;
  technicianSignature: string;
  customerSignature: string;
  completionDate: string;
  customerName: string;
  customerComment: string;
  updatedAt: string;
  createdBy?: string;
}

export interface InventoryPart {
  id: string;
  partNumber: string;
  description: string;
  stock: number;
  updatedAt: string;
}

export interface StaffProfile {
  id: string;
  display_name: string;
  platform_role: 'platform_admin' | null;
  is_active: boolean;
  memberships: OrganizationMembership[];
}

export interface OrganizationMembership {
  organization_id: string;
  role: Exclude<AppRole, 'platform_admin'>;
  is_active: boolean;
  organizations?: { name: string } | { name: string }[] | null;
}

export interface StoredFileMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  category: string;
  equipment: string;
  notes: string;
  added: string;
}
