/*
  # Add payment_terms column to orders_log

  1. Modifications
    - Add `payment_terms` (text, not null, default 'COD') to orders_log table
      - Values: 'COD', 'EFT', 'Kazang', 'Approved Account'

  2. Important Notes
    1. Payment terms are mandatory at checkout, defaulting to COD (Cash)
    2. This field appears on driver trip sheets and accounting intake
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders_log' AND column_name = 'payment_terms'
  ) THEN
    ALTER TABLE orders_log ADD COLUMN payment_terms text NOT NULL DEFAULT 'COD';
  END IF;
END $$;
