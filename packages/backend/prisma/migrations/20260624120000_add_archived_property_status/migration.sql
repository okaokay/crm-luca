DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PropertyStatus'
      AND e.enumlabel = 'ARCHIVED'
  ) THEN
    ALTER TYPE "PropertyStatus" ADD VALUE 'ARCHIVED';
  END IF;
END $$;
