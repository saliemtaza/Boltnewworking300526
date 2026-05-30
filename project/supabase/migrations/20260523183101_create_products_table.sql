/*
  # Create products table with seed data

  1. New Tables
    - `products`
      - `id` (uuid, primary key, auto-generated)
      - `name` (text, product name)
      - `description` (text, product description)
      - `price` (numeric, product price in ZAR)
      - `image_url` (text, URL to product image)
      - `is_in_stock` (boolean, default true)
      - `created_at` (timestamptz, auto-generated)

  2. Security
    - Enable RLS on `products` table
    - Public SELECT policy (catalog is viewable by everyone)
    - Authenticated INSERT/UPDATE/DELETE policies for admin management

  3. Seed Data
    - 5 realistic cold-pressed juice / premium beverage products
    - Using high-quality Unsplash image URLs

  4. Important Notes
    1. Prices are in South African Rand (ZAR)
    2. All products start as in-stock
    3. Images use Unsplash direct URLs for variety
*/

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  image_url text NOT NULL DEFAULT '',
  is_in_stock boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view products"
  ON products FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete products"
  ON products FOR DELETE
  TO authenticated
  USING (true);

INSERT INTO products (name, description, price, image_url, is_in_stock) VALUES
  (
    'Cold-Pressed Green Detox',
    'A vibrant blend of kale, cucumber, green apple, and ginger. Cold-pressed to preserve maximum nutrients and enzymes.',
    85.00,
    'https://images.unsplash.com/photo-1622597249862-67f8f7440f84?w=400&h=400&fit=crop',
    true
  ),
  (
    'Golden Turmeric Elixir',
    'A warming fusion of turmeric, carrot, orange, and a hint of black pepper for enhanced absorption. Anti-inflammatory powerhouse.',
    95.00,
    'https://images.unsplash.com/photo-1613478223719-2ab802602f07?w=400&h=400&fit=crop',
    true
  ),
  (
    'Berry Antioxidant Blast',
    'A rich mix of blueberry, acai, raspberry, and pomegranate. Packed with antioxidants to boost your immune system.',
    110.00,
    'https://images.unsplash.com/photo-1595476108010-b43d2b6713e0?w=400&h=400&fit=crop',
    true
  ),
  (
    'Tropical Paradise Smoothie',
    'Mango, passion fruit, pineapple, and coconut water blended into a refreshing island escape. Naturally sweet and hydrating.',
    90.00,
    'https://images.unsplash.com/photo-1553530666-ba11a7da5f3f?w=400&h=400&fit=crop',
    true
  ),
  (
    'Activated Charcoal Lemonade',
    'A striking jet-black lemonade with activated charcoal, fresh lemon, raw honey, and sparkling water. Detoxifying and delicious.',
    75.00,
    'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&h=400&fit=crop',
    true
  );
