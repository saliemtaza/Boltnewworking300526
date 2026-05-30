/*
  # Add sale_price column and create categories with junction table

  1. Modifications
    - Add `sale_price` (numeric, nullable) column to products table

  2. New Tables
    - `categories` table with id, name, display_order
    - `product_categories` junction table linking products to categories

  3. Data
    - Pre-populate categories: Trucks, Spare Parts, Oils & Fluids, Accessories, ALL ITEMS
    - Link existing products to categories

  4. Security
    - RLS policies for public read, authenticated write on all tables
*/

-- Add sale_price column to products if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'sale_price'
  ) THEN
    ALTER TABLE products ADD COLUMN sale_price numeric;
  END IF;
END $$;

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  display_order integer UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create product_categories junction table
CREATE TABLE IF NOT EXISTS product_categories (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  display_order_within_category integer DEFAULT 0,
  PRIMARY KEY (product_id, category_id)
);

-- Enable RLS on new tables
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DO $$
BEGIN
  DROP POLICY IF EXISTS "Categories are publicly readable" ON categories;
  DROP POLICY IF EXISTS "Authenticated can insert categories" ON categories;
  DROP POLICY IF EXISTS "Authenticated can update categories" ON categories;
  DROP POLICY IF EXISTS "Authenticated can delete categories" ON categories;
  DROP POLICY IF EXISTS "Product categories are publicly readable" ON product_categories;
  DROP POLICY IF EXISTS "Authenticated can manage product categories" ON product_categories;
  DROP POLICY IF EXISTS "Authenticated can update product categories" ON product_categories;
  DROP POLICY IF EXISTS "Authenticated can delete product categories" ON product_categories;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Categories policies
CREATE POLICY "Categories are publicly readable"
  ON categories FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can insert categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete categories"
  ON categories FOR DELETE
  TO authenticated
  USING (true);

-- Product categories policies
CREATE POLICY "Product categories are publicly readable"
  ON product_categories FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can manage product categories"
  ON product_categories FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update product categories"
  ON product_categories FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete product categories"
  ON product_categories FOR DELETE
  TO authenticated
  USING (true);

-- Insert sample categories if not exists
INSERT INTO categories (name, display_order) VALUES
  ('Trucks', 1),
  ('Spare Parts', 2),
  ('Oils & Fluids', 3),
  ('Accessories', 4),
  ('ALL ITEMS', 999)
ON CONFLICT (name) DO NOTHING;

-- Update existing products with sale prices and descriptions
UPDATE products SET
  sale_price = 749.99,
  description = 'Premium synthetic engine oil for heavy trucks, SAE 15W-40',
  image_url = COALESCE(image_url, 'https://images.pexels.com/photos/3693461/pexels-photo-3693461.jpeg?auto=compress&cs=tinysrgb&w=400')
WHERE name = 'Heavy Duty Truck Engine Oil 15L';

UPDATE products SET
  description = 'Replacement air filter kit for most commercial trucks',
  image_url = COALESCE(image_url, 'https://images.pexels.com/photos/3693139/pexels-photo-3693139.jpeg?auto=compress&cs=tinysrgb&w=400')
WHERE name = 'Truck Air Filter Kit';

UPDATE products SET
  sale_price = 999.00,
  description = 'Automatic transmission fluid for truck gearboxes, 20L',
  image_url = COALESCE(image_url, 'https://images.pexels.com/photos/3695172/pexels-photo-3695172.jpeg?auto=compress&cs=tinysrgb&w=400')
WHERE name = 'Heavy Duty Transmission Fluid';

UPDATE products SET
  description = 'Multi-pocket storage organizer for truck cabin',
  image_url = COALESCE(image_url, 'https://images.pexels.com/photos/3962628/pexels-photo-3962628.jpeg?auto=compress&cs=tinysrgb&w=400')
WHERE name = 'Truck Cabin Organizer';

UPDATE products SET
  sale_price = 399.99,
  description = 'DOT 4 brake fluid, 5L bottle for truck brake systems',
  image_url = COALESCE(image_url, 'https://images.pexels.com/photos/3731857/pexels-photo-3731857.jpeg?auto=compress&cs=tinysrgb&w=400')
WHERE name = 'Hydraulic Brake Fluid';

-- Link all products to ALL ITEMS
INSERT INTO product_categories (product_id, category_id, display_order_within_category)
SELECT p.id, c.id, ROW_NUMBER() OVER (ORDER BY p.created_at)
FROM products p
CROSS JOIN categories c
WHERE c.name = 'ALL ITEMS'
ON CONFLICT (product_id, category_id) DO NOTHING;

-- Oils & Fluids products
INSERT INTO product_categories (product_id, category_id, display_order_within_category)
SELECT p.id, c.id, ROW_NUMBER() OVER (ORDER BY p.created_at)
FROM products p
CROSS JOIN categories c
WHERE c.name = 'Oils & Fluids'
AND p.name IN ('Heavy Duty Truck Engine Oil 15L', 'Heavy Duty Transmission Fluid', 'Hydraulic Brake Fluid')
ON CONFLICT (product_id, category_id) DO NOTHING;

-- Spare Parts products
INSERT INTO product_categories (product_id, category_id, display_order_within_category)
SELECT p.id, c.id, 1
FROM products p
CROSS JOIN categories c
WHERE c.name = 'Spare Parts'
AND p.name = 'Truck Air Filter Kit'
ON CONFLICT (product_id, category_id) DO NOTHING;

-- Accessories products
INSERT INTO product_categories (product_id, category_id, display_order_within_category)
SELECT p.id, c.id, 1
FROM products p
CROSS JOIN categories c
WHERE c.name = 'Accessories'
AND p.name = 'Truck Cabin Organizer'
ON CONFLICT (product_id, category_id) DO NOTHING;
