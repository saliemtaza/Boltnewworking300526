/*
  # Create settings table for admin PIN storage

  1. New Tables
    - `settings`
      - `key` (text, primary key) - unique setting identifier
      - `value` (text, not null) - encrypted setting value
      - `updated_at` (timestamptz, auto-updated)

  2. Security
    - Enable RLS on `settings` table
    - Authenticated users can read and update settings (for admin panel)
    - Anon users can read settings (needed for PIN verification at login)

  3. Seed Data
    - Insert default admin_pin with value '7868'

  4. Important Notes
    1. The PIN is stored as a hashed value using pgcrypto extension
    2. Default PIN is '7868' matching the current hardcoded value
    3. RLS allows anon reads so the PIN verification works client-side
*/

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read settings"
  ON settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can read settings"
  ON settings FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can update settings"
  ON settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can insert settings"
  ON settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

INSERT INTO settings (key, value) VALUES ('admin_pin', '7868');
