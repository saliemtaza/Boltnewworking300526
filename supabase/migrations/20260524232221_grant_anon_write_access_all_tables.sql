/*
  # Grant anon write access to all admin-managed tables

  ## Problem
  The app uses the Supabase anon key and never authenticates users. All write
  operations (UPDATE, INSERT, DELETE) on products, categories, settings,
  product_categories, orders_log, vehicles, and broadcast_queues were restricted
  to the `authenticated` role. This caused every admin button to silently fail:
  - Dispatch / Cancel order buttons
  - In/Out of stock toggle
  - Featured star toggle
  - Low stock toggle
  - Delete product (confirm click did nothing)
  - Price / sale price saves
  - Image uploads
  - Category management
  - Settings saves

  ## Changes
  Adds anon INSERT, UPDATE, DELETE policies to all tables that currently only
  have authenticated write policies.
*/

-- products
CREATE POLICY "Anon can insert products"
  ON products FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can update products"
  ON products FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can delete products"
  ON products FOR DELETE TO anon USING (true);

-- categories
CREATE POLICY "Anon can insert categories"
  ON categories FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can update categories"
  ON categories FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can delete categories"
  ON categories FOR DELETE TO anon USING (true);

-- product_categories
CREATE POLICY "Anon can insert product_categories"
  ON product_categories FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can update product_categories"
  ON product_categories FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can delete product_categories"
  ON product_categories FOR DELETE TO anon USING (true);

-- settings
CREATE POLICY "Anon can insert settings"
  ON settings FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can update settings"
  ON settings FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can delete settings"
  ON settings FOR DELETE TO anon USING (true);

-- vehicles
CREATE POLICY "Anon can insert vehicles"
  ON vehicles FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can update vehicles"
  ON vehicles FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can delete vehicles"
  ON vehicles FOR DELETE TO anon USING (true);

-- broadcast_queues
CREATE POLICY "Anon can insert broadcast_queues"
  ON broadcast_queues FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can update broadcast_queues"
  ON broadcast_queues FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can delete broadcast_queues"
  ON broadcast_queues FOR DELETE TO anon USING (true);
