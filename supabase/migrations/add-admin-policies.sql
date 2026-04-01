-- Migration: Add RLS policies for admin management of approved_buyers
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- Ensure the table exists (it may have been created by the webhook already)
CREATE TABLE IF NOT EXISTS approved_buyers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'basic',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE approved_buyers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (safe to re-run)
DROP POLICY IF EXISTS "Anon pode checar email na aprovacao" ON approved_buyers;
DROP POLICY IF EXISTS "Admin gerencia approved_buyers" ON approved_buyers;
DROP POLICY IF EXISTS "Service role full access" ON approved_buyers;

-- 1. Anon/authenticated can SELECT (needed for registration check before user has JWT)
CREATE POLICY "Anon pode checar email na aprovacao" ON approved_buyers
  FOR SELECT USING (true);

-- 2. Admin (talesotto@gmail.com) can SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "Admin gerencia approved_buyers" ON approved_buyers
  FOR ALL USING (auth.jwt()->>'email' = 'talesotto@gmail.com');

-- 3. Service role (used by webhook) has full access (bypasses RLS by default, but just in case)
CREATE POLICY "Service role full access" ON approved_buyers
  FOR ALL USING (auth.role() = 'service_role');
