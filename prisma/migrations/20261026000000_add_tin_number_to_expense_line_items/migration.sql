ALTER TABLE "expense_line_items"
ADD COLUMN "tin_number" TEXT;

ALTER TABLE "expense_line_items"
ADD COLUMN "receipt_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
