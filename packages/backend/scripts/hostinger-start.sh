#!/bin/sh
set -e

echo "Starting Hostinger backend bootstrap..."

npx prisma generate
node scripts/ensure-archived-property-status.js || true
npx prisma migrate resolve --rolled-back 20260624120000_add_archived_property_status || true
npx prisma migrate deploy

if [ "$IMPORT_IMMOBILIARE_CSV_ON_BOOT" = "true" ]; then
  echo "Immobiliare CSV auto-import enabled"
  echo "Configured CSV path: ${IMPORT_IMMOBILIARE_CSV_PATH:-<empty>}"
  echo "Configured admin email: ${IMPORT_ADMIN_EMAIL:-admin@agenziademo.it}"

  if [ -d /app/data/imports ]; then
    echo "Listing /app/data/imports"
    ls -lah /app/data/imports || true
  else
    echo "Directory /app/data/imports does not exist"
  fi

  IMPORT_SOURCE=""
  if [ -n "$IMPORT_IMMOBILIARE_CSV_PATH" ] && [ -f "$IMPORT_IMMOBILIARE_CSV_PATH" ]; then
    IMPORT_SOURCE="$IMPORT_IMMOBILIARE_CSV_PATH"
  else
    FALLBACK_CSV="$(find /app/data/imports -maxdepth 1 -type f -name '*.csv' 2>/dev/null | head -n 1 || true)"
    if [ -n "$FALLBACK_CSV" ] && [ -f "$FALLBACK_CSV" ]; then
      IMPORT_SOURCE="$FALLBACK_CSV"
      echo "Configured CSV not found. Using fallback CSV: $IMPORT_SOURCE"
    fi
  fi

  if [ -z "$IMPORT_SOURCE" ]; then
    echo "ERROR: IMPORT_IMMOBILIARE_CSV_ON_BOOT=true but no CSV file was found."
    echo "Checked configured path: ${IMPORT_IMMOBILIARE_CSV_PATH:-<empty>}"
    exit 1
  fi

  echo "Running immobiliare CSV import from: $IMPORT_SOURCE"
  node scripts/import-immobiliare-properties.js "$IMPORT_SOURCE" "${IMPORT_ADMIN_EMAIL:-admin@agenziademo.it}"
else
  echo "Immobiliare CSV auto-import disabled"
fi

if [ "$SEED_ON_BOOT" = "true" ]; then
  npm run seed
else
  echo "Seed skipped (SEED_ON_BOOT=false)"
fi

exec node dist/main.js
