/*
  # Allow anon role to update orders_log

  ## Problem
  The app uses the Supabase anon key (no auth sign-in), so all requests run
  as the `anon` role. The existing UPDATE policy only covers `authenticated`,
  causing all order status changes (Capture, Dispatch, Cancel) from the admin
  panel to silently fail — RLS blocks them and Supabase returns 0 rows updated
  without throwing an error.

  ## Changes
  - Add UPDATE policy for `anon` role on `orders_log` table
  - Add DELETE policy for `anon` role on `orders_log` table (consistent with insert)
*/

CREATE POLICY "Anon can update orders"
  ON orders_log
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can delete orders"
  ON orders_log
  FOR DELETE
  TO anon
  USING (true);
