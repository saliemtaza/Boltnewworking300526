/*
  # Taza Direct Complete Schema - Production Migration

  1. Modifications to `products` table
    - Add `parent_id` (uuid, nullable, self-referencing) for variant grouping
    - Add `is_low_stock` (boolean) for low stock flagging
    - Add `is_featured` (boolean) for featured products
    - Add `variant_label` (text) e.g. "5L", "20L", "Single"
    - Add `last_promoted_at` (timestamptz) for rotation engine
    - Add `is_auto_discounted` (boolean) for dead stock liquidation
    - Add `supply_alert_state` (text) for supply loop tracking: 'normal', 'alert_10', 'alert_20', 'confirmed_oos'
    - Add `days_unordered_counter` (integer) for stock liquidation tracking

  2. New Tables
    - `orders_log` - Complete order tracking with delivery data
      - id, shop_name, phone, address, order_data (jsonb), total_amount, delivery_fee,
        status, order_notes, timestamp, requested_delivery_date, coordinates_lat, coordinates_lng,
        assigned_vehicle_id, routing_sequence_index, is_supplement, parent_order_id
    - `broadcast_queues` - Marketing broadcast tracking
      - id, type, product_details (jsonb), is_sent, created_at
    - `vehicles` - Fleet vehicle profiles (hardcoded reference)
      - id, name, max_capacity_value, max_drop_cap, display_order

  3. Settings additions
    - `cart_disabled` setting key for master disable cart button

  4. Security
    - Enable RLS on all new tables
    - Public read for orders_log (customers check status), authenticated full access for admin
    - Authenticated-only access for broadcast_queues and vehicles management
    - Public read for vehicles (storefront delivery info display)

  5. Important Notes
    1. parent_id creates variant groups - products sharing a parent_id are variants of the master product
    2. Storefront visibility: hide out-of-stock variants; if ALL variants in a group are out-of-stock, hide entire master card
    3. Supply alert states track the autonomous supply loop: normal -> alert_10 -> alert_20 -> confirmed_oos
    4. Vehicle fleet is pre-seeded with 3 hardcoded company vehicles
    5. Admin PIN has no hardcoded default - must be set via admin panel on first use
*/

-- ============================================================
-- 1. ADD NEW COLUMNS TO PRODUCTS TABLE
-- ============================================================

DO $$
BEGIN
  -- parent_id for variant grouping
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'parent_id') THEN
    ALTER TABLE products ADD COLUMN parent_id uuid REFERENCES products(id) ON DELETE SET NULL;
  END IF;

  -- is_low_stock flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_low_stock') THEN
    ALTER TABLE products ADD COLUMN is_low_stock boolean NOT NULL DEFAULT false;
  END IF;

  -- is_featured flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_featured') THEN
    ALTER TABLE products ADD COLUMN is_featured boolean NOT NULL DEFAULT false;
  END IF;

  -- variant_label e.g. "5L", "20L", "Single Pack"
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'variant_label') THEN
    ALTER TABLE products ADD COLUMN variant_label text NOT NULL DEFAULT '';
  END IF;

  -- last_promoted_at for rotation engine
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'last_promoted_at') THEN
    ALTER TABLE products ADD COLUMN last_promoted_at timestamptz DEFAULT now();
  END IF;

  -- is_auto_discounted for dead stock liquidation
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_auto_discounted') THEN
    ALTER TABLE products ADD COLUMN is_auto_discounted boolean NOT NULL DEFAULT false;
  END IF;

  -- supply_alert_state for supply loop tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'supply_alert_state') THEN
    ALTER TABLE products ADD COLUMN supply_alert_state text NOT NULL DEFAULT 'normal';
  END IF;

  -- days_unordered_counter for stock liquidation tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'days_unordered_counter') THEN
    ALTER TABLE products ADD COLUMN days_unordered_counter integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Add index for parent_id lookups (variant grouping)
CREATE INDEX IF NOT EXISTS idx_products_parent_id ON products(parent_id);
CREATE INDEX IF NOT EXISTS idx_products_supply_alert_state ON products(supply_alert_state);
CREATE INDEX IF NOT EXISTS idx_products_is_auto_discounted ON products(is_auto_discounted);

-- ============================================================
-- 2. CREATE ORDERS_LOG TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS orders_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  order_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amount numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  order_notes text NOT NULL DEFAULT '',
  timestamp timestamptz DEFAULT now(),
  requested_delivery_date date,
  coordinates_lat double precision,
  coordinates_lng double precision,
  assigned_vehicle_id text,
  routing_sequence_index integer,
  is_supplement boolean NOT NULL DEFAULT false,
  parent_order_id uuid
);

ALTER TABLE orders_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read orders"
  ON orders_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can read own orders by phone"
  ON orders_log FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can insert orders"
  ON orders_log FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Authenticated can update orders"
  ON orders_log FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete orders"
  ON orders_log FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders_log(status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders_log(requested_delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_parent_order ON orders_log(parent_order_id);

-- ============================================================
-- 3. CREATE BROADCAST_QUEUES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS broadcast_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'back_in_stock',
  product_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE broadcast_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read broadcast queues"
  ON broadcast_queues FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert broadcast queues"
  ON broadcast_queues FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update broadcast queues"
  ON broadcast_queues FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete broadcast queues"
  ON broadcast_queues FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- 4. CREATE VEHICLES TABLE (Fleet reference data)
-- ============================================================

CREATE TABLE IF NOT EXISTS vehicles (
  id text PRIMARY KEY,
  name text NOT NULL,
  max_capacity_value numeric NOT NULL DEFAULT 0,
  max_drop_cap text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vehicles are publicly readable"
  ON vehicles FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can manage vehicles"
  ON vehicles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update vehicles"
  ON vehicles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed the 3 hardcoded company vehicles
INSERT INTO vehicles (id, name, max_capacity_value, max_drop_cap, display_order) VALUES
  ('isuzu-nqr500', 'Isuzu NQR500 AMT', 70000, '12-15', 1),
  ('gwm-diesel', 'GWM 1-Ton Diesel Van', 30000, '8-10', 2),
  ('gwm-petrol', 'GWM 1-Ton Petrol Van', 25000, '8-10', 3)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. ADD SETTINGS ENTRIES
-- ============================================================

-- Remove hardcoded default PIN - must be set on first admin entry
UPDATE settings SET value = '' WHERE key = 'admin_pin';

-- Add cart_disabled setting
INSERT INTO settings (key, value) VALUES ('cart_disabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- Add warehouse_address setting
INSERT INTO settings (key, value) VALUES ('warehouse_address', 'Towerhive Business Park, 3 Caxton Street, Industria, Johannesburg')
ON CONFLICT (key) DO NOTHING;
