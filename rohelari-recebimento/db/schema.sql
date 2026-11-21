-- ============================================================================
-- ROHELARI RECEBIMENTO — Schema PostgreSQL (Fase 1..7)
-- Multi-empresa (networks) / multi-loja (stores) / multi-equipe
-- Toda tabela de negócio carrega network_id e, quando aplicável, store_id.
-- ============================================================================

CREATE TABLE IF NOT EXISTS networks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  cnpj            text NOT NULL UNIQUE,
  logo_url        text,
  admin_name      text,
  supplier_signup_code text,             -- código de convite para cadastro externo de fornecedores
  auto_approve_appointments boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','suspenso')),
  sysmo_enabled   boolean NOT NULL DEFAULT false,  -- Fase 7: desligado até haver documentação/credencial
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  name            text NOT NULL,
  code            text NOT NULL,
  cnpj            text,
  address         text,
  city            text,
  state           text,
  phone           text,
  receiving_start time NOT NULL DEFAULT '08:00',
  receiving_end   time NOT NULL DEFAULT '17:00',
  weekdays        text NOT NULL DEFAULT '1,2,3,4,5,6',  -- ISO 1=segunda .. 7=domingo
  dock_count      integer NOT NULL DEFAULT 2 CHECK (dock_count >= 0),
  capacity_per_slot integer NOT NULL DEFAULT 2 CHECK (capacity_per_slot >= 1),
  approval_mode   text NOT NULL DEFAULT 'manual' CHECK (approval_mode IN ('manual','auto')),
  responsible_name text,
  sysmo_store_code text,                                   -- Fase 7
  status          text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network_id, code)
);
CREATE INDEX IF NOT EXISTS idx_stores_network ON stores(network_id);

CREATE TABLE IF NOT EXISTS docks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name            text NOT NULL,
  status          text NOT NULL DEFAULT 'livre' CHECK (status IN ('livre','ocupada','manutencao')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);
CREATE INDEX IF NOT EXISTS idx_docks_store ON docks(store_id);

CREATE TABLE IF NOT EXISTS product_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  name            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network_id, name)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  legal_name      text NOT NULL,
  trade_name      text,
  cnpj            text NOT NULL,
  phone           text,
  email           text,
  address         text,
  representative  text,
  sysmo_code      text,                                     -- Fase 7: código do fornecedor no Sysmo
  status          text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo','pendente')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network_id, cnpj)
);
CREATE INDEX IF NOT EXISTS idx_suppliers_network ON suppliers(network_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_cnpj ON suppliers(cnpj);

CREATE TABLE IF NOT EXISTS carriers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  legal_name      text NOT NULL,
  trade_name      text,
  cnpj            text,
  phone           text,
  email           text,
  status          text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network_id, cnpj)
);
CREATE INDEX IF NOT EXISTS idx_carriers_network ON carriers(network_id);

CREATE TABLE IF NOT EXISTS supplier_carriers (
  supplier_id     uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  carrier_id      uuid NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  PRIMARY KEY (supplier_id, carrier_id)
);

CREATE TABLE IF NOT EXISTS supplier_categories (
  supplier_id     uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  category_id     uuid NOT NULL REFERENCES product_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (supplier_id, category_id)
);

CREATE TABLE IF NOT EXISTS drivers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  name            text NOT NULL,
  cpf             text,
  phone           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network_id, cpf)
);

CREATE TABLE IF NOT EXISTS vehicles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  plate           text NOT NULL,
  vehicle_type    text NOT NULL DEFAULT 'truck' CHECK (vehicle_type IN ('carreta','truck','toco','van','utilitario','outro')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network_id, plate)
);

-- ---------------------------------------------------------------------------
-- Usuários e papéis (RBAC real). Um usuário pode ter papéis em lojas distintas.
-- store_id NULL + role rede_admin  → acesso à rede inteira
-- store_id NULL + role fornecedor  → vinculado a supplier_id
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  name            text NOT NULL,
  email           text NOT NULL,
  password_hash   text NOT NULL,
  phone           text,
  status          text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network_id, email)
);
CREATE INDEX IF NOT EXISTS idx_users_network ON users(network_id);

CREATE TABLE IF NOT EXISTS user_roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('rede_admin','loja_gerente','recebimento','fornecedor')),
  store_id        uuid REFERENCES stores(id) ON DELETE CASCADE,   -- NULL p/ rede_admin e fornecedor
  supplier_id     uuid REFERENCES suppliers(id) ON DELETE CASCADE, -- preenchido p/ fornecedor
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, store_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_store ON user_roles(store_id);

CREATE TABLE IF NOT EXISTS sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  ip              text,
  user_agent      text
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash       text NOT NULL,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Capacidade por faixa horária e bloqueios de agenda (por loja)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_slot_capacity (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  slot_time       time NOT NULL,
  capacity        integer NOT NULL CHECK (capacity >= 0),
  UNIQUE (store_id, slot_time)
);

CREATE TABLE IF NOT EXISTS blocked_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  block_date      date NOT NULL,
  slot_time       time,               -- NULL = dia inteiro bloqueado
  reason          text,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blocked_store_date ON blocked_slots(store_id, block_date);

-- ---------------------------------------------------------------------------
-- Agendamentos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  protocol        text NOT NULL UNIQUE,
  supplier_id     uuid NOT NULL REFERENCES suppliers(id),
  carrier_id      uuid REFERENCES carriers(id),
  invoice_number  text,
  nfe_key         text,
  nfe_issue_date  date,
  nfe_value       numeric(14,2),
  integration_code text,                                   -- Fase 7
  integration_status text NOT NULL DEFAULT 'pendente' CHECK (integration_status IN ('pendente','enviado','erro','desabilitada')),
  driver_name     text,
  driver_cpf      text,
  plate           text,
  vehicle_type    text,
  category_id     uuid REFERENCES product_categories(id),
  category_name   text,
  expected_volumes integer CHECK (expected_volumes IS NULL OR expected_volumes >= 0),
  notes           text,
  delivery_date   date NOT NULL,
  slot_time       time NOT NULL,
  status          text NOT NULL DEFAULT 'solicitado' CHECK (status IN (
                    'solicitado','confirmado','chegada_registrada','aguardando_doca',
                    'em_recebimento','concluido','recusado','cancelado','atrasado',
                    'nao_compareceu','parcial')),
  dock_id         uuid REFERENCES docks(id),
  created_by      uuid REFERENCES users(id),
  approved_by     uuid REFERENCES users(id),
  approved_at     timestamptz,
  arrived_at      timestamptz,
  dock_assigned_at timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appt_store_date ON appointments(store_id, delivery_date, slot_time);
CREATE INDEX IF NOT EXISTS idx_appt_network_status ON appointments(network_id, status);
CREATE INDEX IF NOT EXISTS idx_appt_supplier ON appointments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_appt_plate ON appointments(plate);
CREATE INDEX IF NOT EXISTS idx_appt_nfe ON appointments(nfe_key) WHERE nfe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS appointment_status_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  from_status     text,
  to_status       text NOT NULL,
  changed_by      uuid REFERENCES users(id),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_appointment ON appointment_status_history(appointment_id);

-- ---------------------------------------------------------------------------
-- Conferência de mercadorias
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receiving_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  invoice_number  text,
  supplier_id     uuid REFERENCES suppliers(id),
  responsible_name text,
  expected_volumes integer,
  received_volumes integer,
  result          text CHECK (result IN ('total','parcial')),
  notes           text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  started_by      uuid REFERENCES users(id),
  completed_by    uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_receiving_store ON receiving_records(store_id);

CREATE TABLE IF NOT EXISTS receiving_divergences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_id    uuid NOT NULL REFERENCES receiving_records(id) ON DELETE CASCADE,
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('falta','avaria','excesso','divergencia','produto_faltante')),
  description     text NOT NULL,
  quantity        numeric(12,3),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diverg_receiving ON receiving_divergences(receiving_id);

CREATE TABLE IF NOT EXISTS attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  store_id        uuid REFERENCES stores(id) ON DELETE CASCADE,
  appointment_id  uuid REFERENCES appointments(id) ON DELETE CASCADE,
  receiving_id    uuid REFERENCES receiving_records(id) ON DELETE CASCADE,
  filename        text NOT NULL,
  mime            text NOT NULL,
  size_bytes      bigint NOT NULL,
  storage_key     text NOT NULL,
  uploaded_by     uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attach_appointment ON attachments(appointment_id);

-- ---------------------------------------------------------------------------
-- Notificações e auditoria
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  store_id        uuid REFERENCES stores(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id) ON DELETE CASCADE,   -- destinatário (NULL = aviso de rede)
  appointment_id  uuid REFERENCES appointments(id) ON DELETE CASCADE,
  type            text NOT NULL,
  channel         text NOT NULL DEFAULT 'inapp' CHECK (channel IN ('inapp','email','whatsapp')),
  title           text NOT NULL,
  body            text,
  status          text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviada','falha','lida')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  read_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, status);

CREATE TABLE IF NOT EXISTS audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid REFERENCES networks(id) ON DELETE CASCADE,
  store_id        uuid REFERENCES stores(id) ON DELETE SET NULL,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  action          text NOT NULL,
  entity          text NOT NULL,
  entity_id       text,
  details         jsonb,
  ip              text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_network ON audit_logs(network_id, created_at DESC);

-- Fase 7 — fila de integração com Sysmo S1 (preparada; NÃO enviar sem documentação/credencial)
CREATE TABLE IF NOT EXISTS integration_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  appointment_id  uuid REFERENCES appointments(id) ON DELETE CASCADE,
  target          text NOT NULL DEFAULT 'sysmo_s1',
  event           text NOT NULL,
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','erro','desativada')),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
