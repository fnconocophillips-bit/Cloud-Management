#!/usr/bin/env node
/**
 * ServiceNow Car Sales App — SDK Installer
 *
 * Usage:
 *   node install.js [--component <table|business_rules|script_includes|client_scripts|ui_policies|all>]
 *
 * Credentials via flags or environment variables:
 *   --instance / SN_INSTANCE
 *   --user     / SN_USER
 *   --password / SN_PASSWORD
 *
 * Omitting --component (or passing 'all') deploys every component.
 */

'use strict';

const https  = require('https');
const fs     = require('fs');
const path   = require('path');

const args = parseArgs(process.argv.slice(2));

// Normalise instance: accept short name, full hostname, or full URL
function normaliseInstance(raw) {
  if (!raw) return raw;
  raw = raw.replace(/^https?:\/\//, '');   // strip protocol
  raw = raw.split('/')[0];                  // strip path
  raw = raw.replace(/\.service-now\.com$/i, ''); // strip suffix so we don't double it
  return raw.trim();
}

const CONFIG = {
  instance:  normaliseInstance(args.instance  || process.env.SN_INSTANCE),
  user:      args.user      || process.env.SN_USER,
  password:  args.password  || process.env.SN_PASSWORD,
  component: args.component || 'all'
};

if (!CONFIG.instance || !CONFIG.user || !CONFIG.password) {
  console.error('Error: --instance, --user, and --password are required (or set SN_INSTANCE, SN_USER, SN_PASSWORD env vars).');
  process.exit(1);
}

const BASE_URL = `https://${CONFIG.instance}.service-now.com`;
const AUTH     = Buffer.from(`${CONFIG.user}:${CONFIG.password}`).toString('base64');

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    result[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return result;
}

function snRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: `${CONFIG.instance}.service-now.com`,
      path,
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
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createTable() {
  console.log('Creating u_vehicle_sales table...');
  const tabledef = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/tables/vehicle_table.json'), 'utf8'));
  const res = await snRequest('POST', '/api/now/table/sys_db_object', {
    name:         tabledef.table.name,
    label:        tabledef.table.label,
    super_class:  'task'
  });
  if (res.status >= 400) {
    throw new Error(`Table creation failed: ${JSON.stringify(res.body)}`);
  }
  console.log(`  Table created: sys_id = ${res.body.result && res.body.result.sys_id}`);
  const tableSysId = res.body.result && res.body.result.sys_id;
  if (tableSysId) await createOwnerField(tableSysId);
  return res.body.result;
}

async function createOwnerField(tableSysId) {
  console.log('  Adding u_owner field (reference → sys_user)...');
  const res = await snRequest('POST', '/api/now/table/sys_dictionary', {
    name:          'u_vehicle_sales',
    element:       'u_owner',
    column_label:  'Owner',
    internal_type: 'reference',
    reference:     'sys_user',
    mandatory:     'true',
    active:        'true'
  });
  if (res.status >= 400) {
    throw new Error(`Owner field creation failed: ${JSON.stringify(res.body)}`);
  }
  console.log(`  u_owner field created: sys_id = ${res.body.result && res.body.result.sys_id}`);
}

async function uploadScriptInclude() {
  console.log('Uploading VehicleSalesUtils script include...');
  const script = fs.readFileSync(path.join(__dirname, '../src/script_includes/VehicleSalesUtils.js'), 'utf8');
  const res = await snRequest('POST', '/api/now/table/sys_script_include', {
    name:        'VehicleSalesUtils',
    api_name:    'global.VehicleSalesUtils',
    script,
    active:      'true',
    access:      'public'
  });
  console.log(`  Script include status: ${res.status}`);
}

async function uploadBusinessRules() {
  const rules = [
    { name: 'Set Sale Date',  file: 'set_sale_date.js',  when: 'before', insert: true, update: true },
    { name: 'Validate VIN',   file: 'validate_vin.js',   when: 'before', insert: true, update: true }
  ];

  for (const rule of rules) {
    console.log(`Uploading business rule: ${rule.name}...`);
    const script = fs.readFileSync(path.join(__dirname, `../src/business_rules/${rule.file}`), 'utf8');
    const res = await snRequest('POST', '/api/now/table/sys_script', {
      name:        rule.name,
      collection:  'u_vehicle_sales',
      when:        rule.when,
      action_insert: rule.insert ? 'true' : 'false',
      action_update: rule.update ? 'true' : 'false',
      script,
      active: 'true'
    });
    console.log(`  Business rule status: ${res.status}`);
  }
}

async function uploadClientScript() {
  console.log('Uploading client script...');
  const script = fs.readFileSync(path.join(__dirname, '../src/client_scripts/vehicle_sale_form.js'), 'utf8');
  const res = await snRequest('POST', '/api/now/table/sys_script_client', {
    name:       'Vehicle Sale Form Logic',
    table:      'u_vehicle_sales',
    type:       'onChange',
    script,
    active:     'true'
  });
  console.log(`  Client script status: ${res.status}`);
}

const COMPONENTS = {
  table:          createTable,
  script_includes: uploadScriptInclude,
  business_rules: uploadBusinessRules,
  client_scripts: uploadClientScript,
  ui_policies:    () => Promise.resolve() // placeholder — extend as needed
};

async function main() {
  try {
    console.log(`\nConnecting to ${BASE_URL}...`);
    console.log(`Component: ${CONFIG.component}\n`);

    if (CONFIG.component === 'all') {
      for (const fn of Object.values(COMPONENTS)) await fn();
    } else {
      const fn = COMPONENTS[CONFIG.component];
      if (!fn) {
        console.error(`Unknown component: ${CONFIG.component}`);
        console.error(`Valid options: ${Object.keys(COMPONENTS).join(', ')}, all`);
        process.exit(1);
      }
      await fn();
    }

    console.log('\nDeployment complete.');
  } catch (err) {
    console.error('\nDeployment failed:', err.message);
    process.exit(1);
  }
}

main();
