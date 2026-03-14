/**
 * seedMacVendors.ts
 *
 * Downloads the current IEEE MA-L (OUI) database and upserts it into the
 * mac_vendors table.  Custom name overrides (custom_name column) are left
 * completely untouched — only vendor_name and updated_at are written.
 *
 * Usage:
 *   npx tsx server/src/scripts/seedMacVendors.ts
 *
 * The script exits with code 0 on success, 1 on error.
 */

import '../env';               // loads .env so DB credentials are available
import https from 'https';
import http from 'http';
import { db } from '../db';

// ─── Config ───────────────────────────────────────────────────────────────────

/** Official IEEE OUI (MA-L) CSV download URL */
const OUI_CSV_URL = 'https://standards-oui.ieee.org/oui/oui.csv';

/** Rows inserted/updated per batch (Postgres limit is ~65 535 params) */
const BATCH_SIZE = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a bare 6-hex-char assignment string (e.g. "001BC5") to the
 * colon-separated prefix stored in the DB (e.g. "00:1B:C5").
 */
function normalizePrefix(raw: string): string {
  const hex = raw.toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length !== 6) return '';
  return `${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}`;
}

/** Fetch a URL and return the full body as a string, following redirects. */
async function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode ?? '?'} from ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Minimal CSV parser.  The IEEE OUI CSV uses the format:
 *   Registry,Assignment,Organization Name,Organization Address
 * Values may be double-quoted; embedded commas and quotes are allowed per
 * RFC 4180.  We only need columns 1 (Assignment) and 2 (Org Name).
 */
function parseCSV(text: string): Array<{ assignment: string; orgName: string }> {
  const results: Array<{ assignment: string; orgName: string }> = [];
  let i = 0;
  const len = text.length;
  let firstLine = true;

  while (i < len) {
    // Parse one CSV row into fields
    const fields: string[] = [];
    while (i < len && text[i] !== '\r' && text[i] !== '\n') {
      if (text[i] === '"') {
        // Quoted field
        i++;
        let val = '';
        while (i < len) {
          if (text[i] === '"' && text[i + 1] === '"') { val += '"'; i += 2; }
          else if (text[i] === '"') { i++; break; }
          else { val += text[i++]; }
        }
        fields.push(val);
        // skip trailing comma
        if (i < len && text[i] === ',') i++;
      } else {
        // Unquoted field
        let start = i;
        while (i < len && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') i++;
        fields.push(text.slice(start, i));
        if (i < len && text[i] === ',') i++;
      }
    }
    // Skip line ending
    if (i < len && text[i] === '\r') i++;
    if (i < len && text[i] === '\n') i++;

    // Skip header row
    if (firstLine) { firstLine = false; continue; }
    // Need at least Registry, Assignment, OrgName
    if (fields.length < 3) continue;
    const assignment = fields[1].trim();
    const orgName    = fields[2].trim();
    if (assignment && orgName) results.push({ assignment, orgName });
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[seedMacVendors] Downloading IEEE OUI database…');
  console.log(`  URL: ${OUI_CSV_URL}`);

  let text: string;
  try {
    text = await fetchText(OUI_CSV_URL);
  } catch (err) {
    console.error('[seedMacVendors] Download failed:', err);
    process.exit(1);
  }

  console.log(`[seedMacVendors] Downloaded ${(text.length / 1024).toFixed(0)} KB. Parsing…`);
  const records = parseCSV(text);
  console.log(`[seedMacVendors] Parsed ${records.length} entries. Upserting into DB…`);

  const now = new Date();
  let processed = 0;

  // Build normalized rows
  const rows: Array<{ prefix: string; vendor_name: string; updated_at: Date }> = [];
  for (const { assignment, orgName } of records) {
    const prefix = normalizePrefix(assignment);
    if (!prefix) continue;
    // Truncate vendor name to 255 chars just in case
    rows.push({ prefix, vendor_name: orgName.slice(0, 255), updated_at: now });
  }

  // Batch upsert — preserve custom_name column by only updating vendor_name + updated_at
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    await db('mac_vendors')
      .insert(batch)
      .onConflict('prefix')
      .merge(['vendor_name', 'updated_at']);   // keeps custom_name intact
    processed += batch.length;
    if (processed % 5000 === 0 || processed === rows.length) {
      process.stdout.write(`\r  ${processed} / ${rows.length}`);
    }
  }

  console.log(`\n[seedMacVendors] Done — ${rows.length} prefixes upserted.`);

  // Print a quick sanity check
  const total = await db('mac_vendors').count('* as n').first();
  const overrides = await db('mac_vendors').whereNotNull('custom_name').count('* as n').first();
  console.log(
    `[seedMacVendors] Table now contains ${String(total?.n ?? 0)} rows` +
    ` (${String(overrides?.n ?? 0)} custom overrides preserved).`,
  );

  await db.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('[seedMacVendors] Unexpected error:', err);
  process.exit(1);
});
