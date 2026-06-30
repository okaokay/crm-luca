/* eslint-disable no-console */
// Migrazione one-time: sposta le immagini salvate come data:base64 dentro la
// colonna `images` di properties su MinIO, sostituendole con gli URL corti
// /api/properties/:id/images/:fileKey (stesso formato usato dall'upload).
//
// Uso (dentro il container backend):
//   node scripts/migrate-base64-images.js          // esegue la migrazione
//   node scripts/migrate-base64-images.js --dry     // solo report, nessuna modifica
//
// Idempotente: gli URL gia' corti (/api/... o http...) vengono lasciati invariati.

const { PrismaClient } = require('@prisma/client');
const Minio = require('minio');

const DRY_RUN = process.argv.includes('--dry');

const prisma = new PrismaClient();

const runningInDocker = true;
const minioEndpoint = (process.env.MINIO_ENDPOINT || 'minio').trim();
const useSSL = String(process.env.MINIO_USE_SSL || process.env.STORAGE_USE_SSL || 'false')
  .trim()
  .toLowerCase() === 'true';
const minioClient = new Minio.Client({
  endPoint: minioEndpoint,
  port: Number(process.env.MINIO_PORT || (useSSL ? 443 : 9000)),
  useSSL,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
});

const BUCKET = process.env.MINIO_OWNER_DOCUMENTS_BUCKET || 'owner-documents';

const buildSafeFileKey = (prefix, originalName) => {
  const safeName = String(originalName || 'file')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 140);
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
};

const ensureBucket = () =>
  new Promise((resolve, reject) => {
    minioClient.bucketExists(BUCKET, (err, exists) => {
      if (err && err.code !== 'NoSuchBucket') return reject(err);
      if (exists) return resolve();
      minioClient.makeBucket(BUCKET, '', (mkErr) => (mkErr ? reject(mkErr) : resolve()));
    });
  });

const putObject = (key, buffer, contentType) =>
  new Promise((resolve, reject) => {
    minioClient.putObject(BUCKET, key, buffer, buffer.length, { 'Content-Type': contentType }, (err) =>
      err ? reject(err) : resolve()
    );
  });

const extFromMime = (mime) => {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'jpg';
};

async function main() {
  console.log(`[migrate-images] avvio${DRY_RUN ? ' (DRY RUN)' : ''} — bucket=${BUCKET} endpoint=${minioEndpoint}`);
  if (!DRY_RUN) await ensureBucket();

  const properties = await prisma.property.findMany({ select: { id: true, images: true } });
  console.log(`[migrate-images] ${properties.length} immobili totali`);

  let propsChanged = 0;
  let imagesMigrated = 0;
  let bytesFreed = 0;
  let errors = 0;

  for (const property of properties) {
    const images = Array.isArray(property.images) ? property.images : [];
    const base64Count = images.filter((img) => typeof img === 'string' && img.startsWith('data:')).length;
    if (!base64Count) continue;

    const newImages = [];
    for (const img of images) {
      if (typeof img !== 'string' || !img.startsWith('data:')) {
        newImages.push(img);
        continue;
      }
      const match = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(img);
      if (!match) {
        // formato non riconosciuto: lo scarto per non gonfiare la riga
        console.warn(`[migrate-images] ${property.id}: data URL non valido, scartato`);
        continue;
      }
      const mime = match[1];
      const base64 = match[2];
      const buffer = Buffer.from(base64, 'base64');
      bytesFreed += img.length;

      if (DRY_RUN) {
        imagesMigrated += 1;
        newImages.push(`/api/properties/${property.id}/images/(dry-run)`);
        continue;
      }

      try {
        const fileKey = buildSafeFileKey(`property-image-${property.id}`, `migrated.${extFromMime(mime)}`);
        await putObject(fileKey, buffer, mime);
        newImages.push(`/api/properties/${property.id}/images/${encodeURIComponent(fileKey)}`);
        imagesMigrated += 1;
      } catch (e) {
        errors += 1;
        console.error(`[migrate-images] ${property.id}: upload fallito:`, e && e.message ? e.message : e);
        // mantengo il base64 originale per non perdere l'immagine
        newImages.push(img);
      }
    }

    if (!DRY_RUN) {
      await prisma.property.update({ where: { id: property.id }, data: { images: newImages } });
    }
    propsChanged += 1;
    console.log(`[migrate-images] ${property.id}: ${base64Count} immagini base64 -> MinIO`);
  }

  console.log('[migrate-images] ===== RIEPILOGO =====');
  console.log(`  immobili modificati : ${propsChanged}`);
  console.log(`  immagini migrate    : ${imagesMigrated}`);
  console.log(`  byte base64 rimossi : ${(bytesFreed / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  errori              : ${errors}`);
  if (DRY_RUN) console.log('  (DRY RUN: nessuna modifica scritta)');
}

main()
  .catch((e) => {
    console.error('[migrate-images] errore fatale:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
