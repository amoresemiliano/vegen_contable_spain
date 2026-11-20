/**
 * Deliverables I & J:
 * Draft MySQL 8.x Relational Schema Specification & PHP 8.x REST API Contract
 * for future production deployment (Bluehost verification pending).
 */

export const DRAFT_MYSQL_SCHEMA_SQL = `-- VEGEN Finance Spain — Draft MySQL 8.x Schema (Phase 2 Production Target)
-- Note: Verify Bluehost MySQL version, InnoDB utf8mb4_unicode_ci, and private storage before deployment.

CREATE TABLE organizations (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  organization_type ENUM('PLATFORM','ACCOUNTING_FIRM','ADVISORY_FIRM','CLIENT_ENTITY') NOT NULL,
  tax_id VARCHAR(32) NOT NULL,
  city VARCHAR(80),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  primary_org_id VARCHAR(36) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (primary_org_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE roles (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  scope ENUM('PLATFORM','FIRM','CLIENT') NOT NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE role_permissions (
  role_id VARCHAR(36) NOT NULL,
  permission_code VARCHAR(80) NOT NULL,
  PRIMARY KEY (role_id, permission_code),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE memberships (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  organization_id VARCHAR(36) NOT NULL,
  role_id VARCHAR(36) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE client_profiles (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  legal_name VARCHAR(200) NOT NULL,
  tax_id VARCHAR(32) NOT NULL,
  entity_type ENUM('SL','OTHER_COMPANY','AUTONOMO','INDIVIDUAL','BUSINESS_OWNER_PERSONAL') NOT NULL,
  vat_regime ENUM('GENERAL','EXEMPT','NOT_APPLICABLE') NOT NULL,
  accounting_firm_id VARCHAR(36),
  advisory_firm_id VARCHAR(36),
  allows_consolidated_personal_view TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE professional_assignments (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  firm_org_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  discipline ENUM('ACCOUNTING','ADVISORY') NOT NULL,
  can_view_personal_data TINYINT(1) NOT NULL DEFAULT 0,
  assigned_at DATETIME NOT NULL,
  FOREIGN KEY (client_id) REFERENCES client_profiles(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE documents (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  doc_type VARCHAR(40) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  storage_path_private VARCHAR(512) NOT NULL,
  source_channel VARCHAR(40) NOT NULL,
  accounting_period VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL,
  uploaded_by_user_id VARCHAR(36) NOT NULL,
  uploaded_at DATETIME NOT NULL,
  FOREIGN KEY (client_id) REFERENCES client_profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE invoices (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  direction ENUM('ISSUED','RECEIVED') NOT NULL,
  kind ENUM('INVOICE','CREDIT_NOTE','QUOTE') NOT NULL,
  status VARCHAR(24) NOT NULL,
  invoice_number VARCHAR(64) NOT NULL,
  contact_name VARCHAR(180) NOT NULL,
  contact_tax_id VARCHAR(32) NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  taxable_base DECIMAL(14,2) NOT NULL,
  vat_amount DECIMAL(14,2) NOT NULL,
  withholding_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(14,2) NOT NULL,
  linked_document_id VARCHAR(36),
  linked_journal_entry_id VARCHAR(36),
  FOREIGN KEY (client_id) REFERENCES client_profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE journal_entries (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  entry_number INT NOT NULL,
  entry_date DATE NOT NULL,
  period_id VARCHAR(36) NOT NULL,
  concept VARCHAR(255) NOT NULL,
  status ENUM('DRAFT','PROPOSED','UNDER_REVIEW','APPROVED','POSTED','REVERSED') NOT NULL,
  source_document_id VARCHAR(36),
  source_invoice_id VARCHAR(36),
  created_by_user_id VARCHAR(36) NOT NULL,
  approved_by_user_id VARCHAR(36),
  FOREIGN KEY (client_id) REFERENCES client_profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE journal_entry_lines (
  id VARCHAR(36) PRIMARY KEY,
  journal_entry_id VARCHAR(36) NOT NULL,
  account_code VARCHAR(16) NOT NULL,
  description VARCHAR(255) NOT NULL,
  debit DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  credit DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bank_transactions (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  bank_account_id VARCHAR(36) NOT NULL,
  tx_date DATE NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  reconciliation_status VARCHAR(24) NOT NULL,
  reconciled_invoice_id VARCHAR(36),
  fingerprint VARCHAR(160) NOT NULL,
  UNIQUE KEY uq_bank_tx_fingerprint (client_id, bank_account_id, fingerprint),
  FOREIGN KEY (client_id) REFERENCES client_profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tax_declarations (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  model_number VARCHAR(10) NOT NULL,
  period_code VARCHAR(16) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL,
  net_result_amount DECIMAL(14,2),
  external_receipt_ref VARCHAR(120),
  FOREIGN KEY (client_id) REFERENCES client_profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE financial_plans (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  scope ENUM('BUSINESS','PERSONAL','CONSOLIDATED') NOT NULL,
  title VARCHAR(200) NOT NULL,
  status ENUM('DRAFT','READY_FOR_PUBLICATION','PUBLISHED') NOT NULL,
  published_at DATETIME,
  FOREIGN KEY (client_id) REFERENCES client_profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE financial_goals (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  scope ENUM('BUSINESS','PERSONAL') NOT NULL,
  name VARCHAR(180) NOT NULL,
  target_amount DECIMAL(14,2) NOT NULL,
  evidence_funded_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  manual_funded_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(32) NOT NULL,
  FOREIGN KEY (client_id) REFERENCES client_profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_events (
  id VARCHAR(36) PRIMARY KEY,
  occurred_at DATETIME NOT NULL,
  actor_user_id VARCHAR(36) NOT NULL,
  organization_id VARCHAR(36) NOT NULL,
  client_id VARCHAR(36),
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  summary TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

export interface PhpApiEndpointSpec {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  requiredPermission: string;
  description: string;
}

export const PHP_REST_API_ENDPOINTS: PhpApiEndpointSpec[] = [
  { method: 'POST', path: '/api/v1/auth/login', requiredPermission: 'Public', description: 'Autenticación JWT / cookie HttpOnly con validación de membresía organizativa.' },
  { method: 'GET', path: '/api/v1/clients/{clientId}/dashboard', requiredPermission: 'treasury.read', description: 'Resumen agregado por entidad respetando aislamiento empresarial/personal.' },
  { method: 'POST', path: '/api/v1/clients/{clientId}/documents', requiredPermission: 'documents.upload', description: 'Subida multipart a almacenamiento privado fuera de public_html + cola extracción.' },
  { method: 'PATCH', path: '/api/v1/documents/{docId}/review', requiredPermission: 'documents.review', description: 'Corrección de campos extraídos, regla de preferencia y aprobación documental.' },
  { method: 'POST', path: '/api/v1/clients/{clientId}/journal-entries', requiredPermission: 'accounting.entries.create', description: 'Creación de asiento con validación transaccional Debe = Haber en servidor.' },
  { method: 'POST', path: '/api/v1/journal-entries/{entryId}/approve', requiredPermission: 'accounting.entries.approve', description: 'Aprobación y contabilización inmutable con registro en audit_events.' },
  { method: 'POST', path: '/api/v1/clients/{clientId}/tax/303/draft', requiredPermission: 'tax.drafts.generate', description: 'Generación de borrador indicativo Modelo 303 desde facturas y asientos validados.' },
  { method: 'POST', path: '/api/v1/clients/{clientId}/bank-imports', requiredPermission: 'treasury.transactions.import', description: 'Importación CSV idempotente mediante UNIQUE KEY de huella bancaria.' },
  { method: 'POST', path: '/api/v1/reconciliations/approve', requiredPermission: 'treasury.reconciliation.approve', description: 'Conciliación banco-factura con verificación de saldo pendiente.' },
  { method: 'POST', path: '/api/v1/clients/{clientId}/financial-plans/{planId}/publish', requiredPermission: 'finance.plans.publish', description: 'Publicación de plan financiero y notificación al cliente titular.' },
  { method: 'POST', path: '/api/v1/roles', requiredPermission: 'roles.manage', description: 'Creación, clonado y edición de roles RBAC en servidor.' },
];
