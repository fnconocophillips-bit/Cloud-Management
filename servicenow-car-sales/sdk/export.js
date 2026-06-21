#!/usr/bin/env node
/**
 * ServiceNow Car Sales App — Export Tool
 *
 * Exports current vehicle sales data to a local JSON file.
 *
 * Usage:
 *   node export.js --instance <name> --user <user> --password <pass> [--output sales.json]
 */

'use strict';

const https  = require('https');
const fs     = require('fs');

const args = parseArgs(process.argv.slice(2));

function normaliseInstance(raw) {
  if (!raw) return raw;
  raw = raw.replace(/^https?:\/\//, '');
  raw = raw.split('/')[0];
  raw = raw.replace(/\.service-now\.com$/i, '');
  return raw.trim();
}

const CONFIG = {
  instance: normaliseInstance(args.instance || process.env.SN_INSTANCE),
  user:     args.user     || process.env.SN_USER,
  password: args.password || process.env.SN_PASSWORD,
  output:   args.output   || 'vehicle_sales_export.json'
};

if (!CONFIG.instance || !CONFIG.user || !CONFIG.password) {
  console.error('Error: --instance, --user, and --password are required.');
  process.exit(1);
}

const AUTH = Buffer.from(`${CONFIG.user}:${CONFIG.password}`).toString('base64');

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    result[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return result;
}

function fetchSales() {
  return new Promise((resolve, reject) => {
    const fields = [
      'u_vin', 'u_make', 'u_model', 'u_year', 'u_color', 'u_condition',
      'u_mileage', 'u_asking_price', 'u_sale_price', 'u_sale_status',
      'u_sale_date', 'u_buyer_name', 'u_buyer_email', 'u_salesperson',
      'sys_created_on', 'sys_updated_on'
    ].join(',');

    const path = `/api/now/table/u_vehicle_sales?sysparm_fields=${fields}&sysparm_limit=10000`;

    const options = {
      hostname: `${CONFIG.instance}.service-now.com`,
      path,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('Fetching vehicle sales data...');
  const data = await fetchSales();
  const records = data.result || [];
  const summary = {
    exported_at:   new Date().toISOString(),
    total_records: records.length,
    sold:          records.filter(r => r.u_sale_status === 'sold').length,
    available:     records.filter(r => r.u_sale_status === 'available').length,
    reserved:      records.filter(r => r.u_sale_status === 'reserved').length,
    records
  };

  fs.writeFileSync(CONFIG.output, JSON.stringify(summary, null, 2));
  console.log(`Exported ${records.length} records to ${CONFIG.output}`);
  console.log(`  Sold: ${summary.sold} | Available: ${summary.available} | Reserved: ${summary.reserved}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
