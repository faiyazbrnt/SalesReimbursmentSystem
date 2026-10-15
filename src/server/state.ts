import { v4 as uuidv4 } from 'uuid';
import {
  User, UserRole, Mom, Claim, ExpenseLineItem, Approval, StatusHistory, Email,
  CashAdvance, Liquidation, LiquidationLineItem, ReviewMeeting, ImportBatch,
  SupportRequest, SupportRequestMessage, ApproverDelegation, Company,
  MasterDataRecord, Department, CostCenter, BusinessUnit, Branch, ProjectCode, Vendor,
  FieldDefinition,
} from '../lib/db/serverTypes';

export const SEED_COMPANIES: { name: string; industry: string; notes: string; address?: string; contact_person?: string; contact_email?: string }[] = [
  // Sales
  { name: 'SM Prime Holdings', industry: 'Real Estate & Retail', notes: 'Enterprise account — mall and residential developments, decade-long relationship.', address: 'SM Corporate Offices, Bldg. A, SM Mall of Asia Complex, Pasay City', contact_person: 'Cristina Reyes', contact_email: 'c.reyes@smprime.com' },
  { name: 'PLDT Inc', industry: 'Telecommunications', notes: 'National telco carrier; ongoing infrastructure and connectivity contracts.', address: 'Ramon Cojuangco Building, Makati Ave, Makati City', contact_person: 'Miguel Torres', contact_email: 'm.torres@pldt.com.ph' },
  { name: 'Jollibee Foods Corp', industry: 'Food & Beverage', notes: 'Fast-food franchise group; recurring catering and supply agreements.', address: 'Jollibee Plaza, F. Ortigas Jr. Road, Ortigas Center, Pasig City', contact_person: 'Anna Villanueva', contact_email: 'a.villanueva@jollibee.com.ph' },
  { name: 'Bank of the Philippine Islands', industry: 'Banking & Finance', notes: 'Long-standing corporate banking client, multiple branches engaged.', address: 'BPI Building, Ayala Ave cor. Paseo de Roxas, Makati City', contact_person: 'Ramon Aquino', contact_email: 'r.aquino@bpi.com.ph' },
  { name: 'Globe Telecom', industry: 'Telecommunications', notes: 'Competing telco account, handled by a separate sales pod.', address: 'The Globe Tower, 32nd St cor 7th Ave, BGC, Taguig City', contact_person: 'Katrina Dizon', contact_email: 'k.dizon@globe.com.ph' },
  { name: 'San Miguel Corporation', industry: 'Conglomerate', notes: 'Diversified food, beverage, and infrastructure holding company.', address: 'San Miguel Properties Centre, St. Francis St, Mandaluyong City', contact_person: 'Ferdinand Cruz', contact_email: 'f.cruz@sanmiguel.com.ph' },
  { name: 'Meralco', industry: 'Utilities', notes: 'Power distribution utility; regulated-sector account, longer sales cycles.', address: 'Lopez Building, Ortigas Ave, Pasig City', contact_person: 'Josefina Ramos', contact_email: 'j.ramos@meralco.com.ph' },
  { name: 'BDO Unibank', industry: 'Banking & Finance', notes: 'Largest local bank by assets; high-value, high-touch relationship.', address: 'BDO Corporate Center, 7899 Makati Ave, Makati City', contact_person: 'Patricia Lim', contact_email: 'p.lim@bdo.com.ph' },
  // Marketing
  { name: 'Creative Agency', industry: 'Advertising & Marketing', notes: 'Retained creative and production partner for campaign assets.', address: '88 Corporate Center, Sedeño St, Salcedo Village, Makati City', contact_person: 'Diego Santos', contact_email: 'diego@creativeagency.ph' },
  { name: 'Partner Promo Group', industry: 'Marketing & Events', notes: 'Handles promotional campaigns and in-store activations.', address: 'Unit 12B, One Corporate Centre, Ortigas Center, Pasig City', contact_person: 'Bianca Fernando', contact_email: 'bianca@partnerpromo.ph' },
  { name: 'Media Corp', industry: 'Media & Broadcasting', notes: 'Ad placement and sponsorship partner across TV and digital.', address: 'Media Corp Building, EDSA cor Mother Ignacia Ave, Quezon City', contact_person: 'Leo Manalo', contact_email: 'leo.manalo@mediacorp.ph' },
  // Engineering
  { name: 'Internal Operations', industry: 'Internal', notes: 'Cross-department engineering support requests, not an external client.' },
  { name: 'Beta Testing Corp', industry: 'Software QA', notes: 'External beta/UAT partner for pre-release builds.' },
  { name: 'DevOps Consultants', industry: 'IT Consulting', notes: 'Infrastructure and CI/CD advisory retainer.' },
  // Operations
  { name: 'Headquarters', industry: 'Internal', notes: 'Main office — facilities and administrative expenses.' },
  { name: 'Cebu Branch Office', industry: 'Internal', notes: 'Regional office covering Visayas operations.' },
  { name: 'Manila Warehouse', industry: 'Internal', notes: 'Logistics and inventory hub serving NCR.' },
  // Used by hand-written seed demo records
  { name: 'Ayala Land Inc', industry: 'Real Estate', notes: 'Premium property developer; executive-level relationship.' },
  { name: 'Maxs Restaurant Corp', industry: 'Food & Beverage', notes: 'Restaurant chain; catering and corporate events account.' },
  { name: 'JG Summit', industry: 'Conglomerate', notes: 'Diversified holdings spanning aviation, food, and petrochemicals.' },
  { name: 'Robinsons Land Corp', industry: 'Real Estate', notes: 'Mall and mixed-use property developer.' },
  { name: 'Cebu Pacific Air', industry: 'Aviation', notes: 'Airline partner for transportation and logistics arrangements.' },
  { name: 'Metrobank', industry: 'Banking & Finance', notes: 'Corporate banking and treasury services relationship.' },
  { name: 'Internal / Partner', industry: 'Internal', notes: 'Catch-all bucket for internal or not-yet-classified partner meetings.' },
  { name: 'Aboitiz Equity', industry: 'Conglomerate', notes: 'Diversified holdings in power, banking, and food.' },
  { name: 'San Miguel Corp', industry: 'Conglomerate', notes: 'Diversified food, beverage, and infrastructure holding company.' },
  { name: 'Megaworld Corp', industry: 'Real Estate', notes: 'Township and mixed-use property developer.' },
  { name: 'Robinsons Land', industry: 'Real Estate', notes: 'Mall and mixed-use property developer.' },
];

export const buildInitialCompanies = (): Company[] =>
  SEED_COMPANIES.map(c => ({
    id: uuidv4(), name: c.name, industry: c.industry, notes: c.notes,
    address: c.address, contact_person: c.contact_person, contact_email: c.contact_email,
  }));

export const buildMasterDataSeed = (items: { name: string; code?: string }[]): MasterDataRecord[] => {
  const now = new Date().toISOString();
  return items.map(i => ({ id: uuidv4(), name: i.name, code: i.code, active: true, created_at: now, updated_at: now }));
};

export const SEED_DEPARTMENTS = ['Sales', 'Marketing', 'Engineering', 'Operations', 'Finance', 'IT', 'Executive'].map(name => ({ name }));
export const SEED_COST_CENTERS = [
  { name: 'Sales Ops', code: 'CC-100' },
  { name: 'Marketing', code: 'CC-200' },
  { name: 'Engineering', code: 'CC-300' },
  { name: 'Corporate', code: 'CC-400' },
];
export const SEED_BUSINESS_UNITS = ['Enterprise Sales', 'SMB Sales', 'Client Services', 'Corporate'].map(name => ({ name }));
export const SEED_BRANCHES = [
  { name: 'Manila HQ', code: 'MNL-01' },
  { name: 'Cebu Branch', code: 'CEB-01' },
  { name: 'Davao Branch', code: 'DVO-01' },
];
export const SEED_PROJECT_CODES = [
  { name: 'General', code: 'PRJ-GENERAL' },
  { name: 'New Business', code: 'PRJ-NEWBIZ' },
  { name: 'Renewal', code: 'PRJ-RENEWAL' },
];
export const SEED_VENDORS = ['Grab', 'Petron', 'Starbucks', 'PLDT'].map(name => ({ name }));

export const buildInitialDepartments = (): Department[] => buildMasterDataSeed(SEED_DEPARTMENTS);
export const buildInitialCostCenters = (): CostCenter[] => buildMasterDataSeed(SEED_COST_CENTERS);
export const buildInitialBusinessUnits = (): BusinessUnit[] => buildMasterDataSeed(SEED_BUSINESS_UNITS);
export const buildInitialBranches = (): Branch[] => buildMasterDataSeed(SEED_BRANCHES);
export const buildInitialProjectCodes = (): ProjectCode[] => buildMasterDataSeed(SEED_PROJECT_CODES);
export const buildInitialVendors = (): Vendor[] => buildMasterDataSeed(SEED_VENDORS);

export const buildInitialFieldDefinitions = (): FieldDefinition[] => {
  const now = new Date().toISOString();
  const defs: Omit<FieldDefinition, 'id' | 'created_at' | 'updated_at'>[] = [
    {
      entity: 'mom', key: 'type_of_account', label: 'Type of Account', input_type: 'dropdown',
      required: false, active: true, display_order: 1,
      options: ['Existing', 'New Client', 'Dormant'],
    },
    {
      entity: 'mom', key: 'category', label: 'Category', input_type: 'dropdown',
      required: false, active: true, display_order: 2,
      options: ['Sales Call', 'Client Servicing', 'Business Review', 'Contract/Negotiation'],
      allow_other: true,
    },
    {
      entity: 'mom', key: 'contact_person_designation', label: 'Contact Person Designation', input_type: 'text',
      required: false, active: true, display_order: 3,
    },
  ];
  return defs.map(d => ({ ...d, id: uuidv4(), created_at: now, updated_at: now }));
};

export const withEntraFields = (u: User): User => ({
  ...u,
  entra_object_id: `fake-oid-${u.id}`,
  user_principal_name: u.email,
});

export const buildDefaultUsers = (): User[] => [
  { id: 'u1', name: 'Mia Fernandez', email: 'mia@mgenesis.com', role: UserRole.REQUESTOR, department: 'Marketing', job_title: 'Marketing Specialist', reports_to: 'u2', avatar_url: '/avatars/corp_female_1.jpg' },
  { id: 'u2', name: 'Noah Villanueva', email: 'noah@mgenesis.com', role: UserRole.APPROVER, department: 'Marketing', job_title: 'Marketing Director', reports_to: null, avatar_url: '/avatars/corp_male_1.jpg' },
  { id: 'u3', name: 'Carol Ramos', email: 'carol@mgenesis.com', role: UserRole.CUSTODIAN, department: 'Finance', job_title: 'Reimbursement Processor', reports_to: null, avatar_url: '/avatars/corp_female_2.jpg' },
  { id: 'u4', name: 'Dave Lopez', email: 'dave@mgenesis.com', role: UserRole.ADMIN, department: 'IT', job_title: 'System Admin', reports_to: null, avatar_url: '/avatars/corp_male_1.jpg' },
  { id: 'u22', name: 'Sofia Lim', email: 'sofia@mgenesis.com', role: UserRole.FINANCE, department: 'Finance', job_title: 'Finance Analyst', reports_to: null, avatar_url: '/avatars/corp_female_4.jpg' },
].map(withEntraFields);

export const applyHierarchySyncDefaults = (userList: User[]) => {
  userList.forEach(u => {
    u.employment_status = 'Active';
    u.can_approve_reimbursements = u.role === UserRole.APPROVER && userList.some(x => x.reports_to === u.id);
  });
};

const initialUsers = buildDefaultUsers();
applyHierarchySyncDefaults(initialUsers);

export interface ServerState {
  moms: Mom[];
  claims: Claim[];
  expenses: ExpenseLineItem[];
  approvals: Approval[];
  statusHistories: StatusHistory[];
  emails: Email[];
  teamsMessages: Email[];
  lastSeenStore: Record<string, Record<string, string>>;
  cashAdvances: CashAdvance[];
  liquidations: Liquidation[];
  liquidationLineItems: LiquidationLineItem[];
  reviewMeetings: ReviewMeeting[];
  importBatches: ImportBatch[];
  supportRequests: SupportRequest[];
  supportMessages: SupportRequestMessage[];
  delegations: ApproverDelegation[];
  companies: Company[];
  departments: Department[];
  costCenters: CostCenter[];
  businessUnits: BusinessUnit[];
  branches: Branch[];
  projectCodes: ProjectCode[];
  vendors: Vendor[];
  fieldDefinitions: FieldDefinition[];
  users: User[];
  systemSettings: {
    expenseCategories: string[];
    highValueThreshold: number;
    paymentMethods: string[];
    categoryLimits: Record<string, number>;
  };
  claimCounter: number;
  suppressHistoryPersistence: boolean;
}

const globalForState = globalThis as typeof globalThis & {
  salesReimbursementState?: ServerState;
};

export const state: ServerState = globalForState.salesReimbursementState ?? {
  moms: [],
  claims: [],
  expenses: [],
  approvals: [],
  statusHistories: [],
  emails: [],
  teamsMessages: [],
  lastSeenStore: {},
  cashAdvances: [],
  liquidations: [],
  liquidationLineItems: [],
  reviewMeetings: [],
  importBatches: [],
  supportRequests: [],
  supportMessages: [],
  delegations: [],
  companies: buildInitialCompanies(),
  departments: buildMasterDataSeed(SEED_DEPARTMENTS),
  costCenters: buildMasterDataSeed(SEED_COST_CENTERS),
  businessUnits: buildMasterDataSeed(SEED_BUSINESS_UNITS),
  branches: buildMasterDataSeed(SEED_BRANCHES),
  projectCodes: buildMasterDataSeed(SEED_PROJECT_CODES),
  vendors: buildMasterDataSeed(SEED_VENDORS),
  fieldDefinitions: buildInitialFieldDefinitions(),
  users: initialUsers,
  systemSettings: {
    expenseCategories: [
      'Client Meals', 'Accommodation', 'Transportation',
      'Office Supplies', 'Software Subscriptions', 'Training', 'Miscellaneous'
    ],
    highValueThreshold: 15000,
    paymentMethods: ['Cash', 'GCash', 'Bank Transfer', 'Check'],
    categoryLimits: {},
  },
  claimCounter: 123,
  suppressHistoryPersistence: false,
};

if (process.env.NODE_ENV !== 'production') {
  globalForState.salesReimbursementState = state;
}

export function checkCategoryLimits(items: Array<{ category?: string; amount?: number }>): string | null {
  const limits = state.systemSettings.categoryLimits || {};
  for (const item of items) {
    const cap = item.category ? limits[item.category] : undefined;
    if (cap && cap > 0 && Number(item.amount) > cap) {
      return `Company policy caps ${item.category} at PHP ${Number(cap).toLocaleString('en-PH')} per item — one line is PHP ${Number(item.amount).toLocaleString('en-PH')}. Adjust it or request an exception.`;
    }
  }
  return null;
}
