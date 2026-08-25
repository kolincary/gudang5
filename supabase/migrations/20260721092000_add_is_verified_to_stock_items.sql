/*
  # Add is_verified to stock_items

  1. Changes
    - Add `is_verified` boolean column to `stock_items` table with default value `false`.
    - This column is used to mark stock items that have been arranged/audited and should not be affected by mass transfer/empty rack operations.
*/

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;

-- Create an index for faster filtering of verified vs unverified items
CREATE INDEX IF NOT EXISTS idx_stock_items_is_verified ON stock_items (is_verified);
