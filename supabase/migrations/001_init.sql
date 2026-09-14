-- ============================================================
-- Migration: 001_init.sql
-- Description: Initial schema for Saathi Vyapar
-- Created: 2024
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255),
  language VARCHAR(10) DEFAULT 'hi',
  role VARCHAR(20) DEFAULT 'entrepreneur' CHECK (role IN ('entrepreneur', 'facilitator', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business profiles table
CREATE TABLE IF NOT EXISTS business_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  business_name VARCHAR(255),
  sector VARCHAR(100),
  district VARCHAR(100),
  state VARCHAR(100),
  monthly_revenue_est NUMERIC(12,2),
  monthly_expense_est NUMERIC(12,2),
  existing_loans BOOLEAN DEFAULT FALSE,
  category VARCHAR(50),
  gender VARCHAR(20),
  shg_membership VARCHAR(50) DEFAULT 'none',
  is_shg_member BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schemes table
CREATE TABLE IF NOT EXISTS schemes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  benefit_summary TEXT,
  eligibility_rules JSONB,
  application_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Financial plans table
CREATE TABLE IF NOT EXISTS financial_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  break_even_units NUMERIC(12,2),
  margin_percent NUMERIC(5,2),
  plan_json JSONB,
  matched_scheme_ids UUID[],
  summary_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ledger entries table
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  entry_type VARCHAR(10) CHECK (entry_type IN ('income', 'expense')),
  description TEXT,
  source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'ocr', 'whatsapp')),
  confirmed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(20) CHECK (channel IN ('whatsapp', 'sms')),
  state VARCHAR(100) DEFAULT 'idle',
  context JSONB DEFAULT '{}',
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Facilitators-Entrepreneurs link table
CREATE TABLE IF NOT EXISTS facilitators_entrepreneurs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facilitator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  entrepreneur_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(facilitator_id, entrepreneur_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON business_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_user_id ON ledger_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_created_at ON ledger_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_financial_plans_user_id ON financial_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
