#!/usr/bin/env node
/**
 * Loads demo vehicle records into the u_vehicle_sales table.
 * Safe to re-run — skips records whose VIN already exists.
 *
 * Usage:
 *   node load_demo_data.js
 *
 * Reads credentials from SN_INSTANCE / SN_USER / SN_PASSWORD env vars.
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

function normaliseInstance(raw) {
  if (!raw) return raw;
  raw = raw.replace(/^https?:\/\//, '');
  raw = raw.split('/')[0];
  raw = raw.replace(/\.service-now\.com$/i, '');
  return raw.trim();
}

const INSTANCE = normaliseInstance(process.env.SN_INSTANCE);
const USER     = process.env.SN_USER;
const PASSWORD = process.env.SN_PASSWORD;
const AUTH     = Buffer.from(`${USER}:${PASSWORD}`).toString('base64');

if (!INSTANCE || !USER || !PASSWORD) {
  console.error('SN_INSTANCE, SN_USER, and SN_PASSWORD must be set.');
  process.exit(1);
}

function snRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: `${INSTANCE}.service-now.com`,
      path:     apiPath,
      method,
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function vinExists(vin) {
  const res = await snRequest(
    'GET',
    `/api/now/table/u_vehicle_sales?sysparm_query=u_vin=${encodeURIComponent(vin)}&sysparm_limit=1&sysparm_fields=sys_id`
  );
  return res.body && res.body.result && res.body.result.length > 0;
}

async function main() {
  const vehicles = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../src/demo_data/demo_vehicles.json'), 'utf8')
  );

  console.log(`Loading ${vehicles.length} demo vehicles into ${INSTANCE}.service-now.com...\n`);

  let created = 0;
  let skipped = 0;

  for (const vehicle of vehicles) {
    const exists = await vinExists(vehicle.u_vin);
    if (exists) {
      console.log(`  SKIP  ${vehicle.u_year} ${vehicle.u_make} ${vehicle.u_model} (VIN already exists)`);
      skipped++;
      continue;
    }

    // Strip empty strings and internal _meta keys before posting
    const payload = {};
    for (const [key, val] of Object.entries(vehicle)) {
      if (val !== '' && !key.startsWith('_')) payload[key] = val;
    }

    const res = await snRequest('POST', '/api/now/table/u_vehicle_sales', payload);

    if (res.status === 201) {
      console.log(`  OK    ${vehicle.u_year} ${vehicle.u_make} ${vehicle.u_model} [${vehicle.u_sale_status}]`);
      created++;
    } else {
      console.error(`  FAIL  ${vehicle.u_vin} — HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  console.log(`\nDone. Created: ${created} | Skipped: ${skipped} | Total: ${vehicles.length}`);
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
