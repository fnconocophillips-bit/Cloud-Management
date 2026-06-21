#!/usr/bin/env node
/**
 * ServiceNow Car Sales App — Deleter
 *
 * Removes all app components from the target ServiceNow instance:
 *   - All records from the u_vehicle_sales table
 *   - Business rules (Set Sale Date, Validate VIN)
 *   - Script include (VehicleSalesUtils)
 *   - Client script (Vehicle Sale Form Logic)
 *   - Application menu and its modules (Vehicle Sales Tracker)
 *   - The u_vehicle_sales table itself (and its dictionary entries)
 *
 * Usage:
 *   node delete.js [--skip-table] [--dry-run]
 *
 * Credentials via flags or environment variables:
 *   --instance / SN_INSTANCE
 *   --user     / SN_USER
 *   --password / SN_PASSWORD
 *
 * --skip-table   Delete app components but leave the table and its data intact.
 * --dry-run      Print what would be deleted without making any changes.
 */

'use strict';

const https = require('https');

const args = parseArgs(process.argv.slice(2));

function normaliseInstance(raw) {
  if (!raw) return raw;
  raw = raw.replace(/^https?:\/\//, '');
  raw = raw.split('/')[0];
  raw = raw.replace(/\.service-now\.com$/i, '');
  return raw.trim();
}

const CONFIG = {
  instance:  normaliseInstance(args.instance  || process.env.SN_INSTANCE),
  user:      args.user      || process.env.SN_USER,
  password:  args.password  || process.env.SN_PASSWORD,
  skipTable: 'skip-table' in args,
  dryRun:    'dry-run' in args
};

if (!CONFIG.instance || !CONFIG.user || !CONFIG.password) {
  console.error('Error: --instance, --user, and --password are required (or set SN_INSTANCE, SN_USER, SN_PASSWORD).');
  process.exit(1);
}

const AUTH = Buffer.from(`${CONFIG.user}:${CONFIG.password}`).toString('base64');

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    result[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return result;
}

function snRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: `${CONFIG.instance}.service-now.com`,
      path: apiPath,
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

async function deleteByQuery(label, table, query) {
  const res = await snRequest('GET', `/api/now/table/${table}?sysparm_query=${encodeURIComponent(query)}&sysparm_fields=sys_id,name,title,element&sysparm_limit=200`);
  const records = (res.body && res.body.result) || [];

  if (records.length === 0) {
    console.log(`  ${label}: none found, skipping.`);
    return;
  }

  for (const rec of records) {
    const id = rec.sys_id;
    const displayName = rec.name || rec.title || rec.element || id;
    if (CONFIG.dryRun) {
      console.log(`  [dry-run] Would DELETE ${label}: ${displayName} (${id})`);
    } else {
      const del = await snRequest('DELETE', `/api/now/table/${table}/${id}`);
      if (del.status === 204 || del.status === 200) {
        console.log(`  DELETED  ${label}: ${displayName}`);
      } else {
        console.error(`  FAILED   ${label}: ${displayName} (${del.status}) ${JSON.stringify(del.body)}`);
      }
    }
  }
}

async function deleteTableRecords() {
  console.log('\nDeleting all vehicle sales records...');
  await deleteByQuery('record', 'u_vehicle_sales', 'active=true^ORactive=false');
}

async function deleteBusinessRules() {
  console.log('\nDeleting business rules...');
  await deleteByQuery('business rule', 'sys_script', 'collection=u_vehicle_sales^nameLIKESet Sale Date^ORcollection=u_vehicle_sales^nameLIKEValidate VIN');
}

async function deleteScriptInclude() {
  console.log('\nDeleting script include...');
  await deleteByQuery('script include', 'sys_script_include', 'name=VehicleSalesUtils');
}

async function deleteClientScript() {
  console.log('\nDeleting client script...');
  await deleteByQuery('client script', 'sys_script_client', 'table=u_vehicle_sales^name=Vehicle Sale Form Logic');
}

async function deleteAppMenu() {
  console.log('\nDeleting application menu modules...');
  const menuRes = await snRequest('GET', `/api/now/table/sys_app_application?sysparm_query=${encodeURIComponent('title=Vehicle Sales Tracker')}&sysparm_fields=sys_id,title&sysparm_limit=1`);
  const menus = (menuRes.body && menuRes.body.result) || [];

  if (menus.length === 0) {
    console.log('  Application menu not found, skipping.');
    return;
  }

  const menuSysId = menus[0].sys_id;
  await deleteByQuery('module', 'sys_app_module', `application=${menuSysId}`);

  if (CONFIG.dryRun) {
    console.log(`  [dry-run] Would DELETE application menu: Vehicle Sales Tracker (${menuSysId})`);
  } else {
    const del = await snRequest('DELETE', `/api/now/table/sys_app_application/${menuSysId}`);
    if (del.status === 204 || del.status === 200) {
      console.log('  DELETED  application menu: Vehicle Sales Tracker');
    } else {
      console.error(`  FAILED   application menu (${del.status}) ${JSON.stringify(del.body)}`);
    }
  }
}

async function deleteTable() {
  console.log('\nDeleting table dictionary entries...');
  await deleteByQuery('dictionary entry', 'sys_dictionary', 'name=u_vehicle_sales^element!=NULL');

  console.log('\nDeleting u_vehicle_sales table...');
  const res = await snRequest('GET', `/api/now/table/sys_db_object?sysparm_query=name=u_vehicle_sales&sysparm_limit=1&sysparm_fields=sys_id,name`);
  const tables = (res.body && res.body.result) || [];

  if (tables.length === 0) {
    console.log('  Table not found, skipping.');
    return;
  }

  const sysId = tables[0].sys_id;
  if (CONFIG.dryRun) {
    console.log(`  [dry-run] Would DELETE table: u_vehicle_sales (${sysId})`);
  } else {
    const del = await snRequest('DELETE', `/api/now/table/sys_db_object/${sysId}`);
    if (del.status === 204 || del.status === 200) {
      console.log('  DELETED  table: u_vehicle_sales');
    } else {
      console.error(`  FAILED   table: u_vehicle_sales (${del.status}) ${JSON.stringify(del.body)}`);
    }
  }
}

async function main() {
  console.log(`\nConnecting to https://${CONFIG.instance}.service-now.com`);
  if (CONFIG.dryRun) console.log('DRY RUN — no changes will be made.\n');

  await deleteTableRecords();
  await deleteBusinessRules();
  await deleteScriptInclude();
  await deleteClientScript();
  await deleteAppMenu();

  if (!CONFIG.skipTable) {
    await deleteTable();
  } else {
    console.log('\n--skip-table set: leaving u_vehicle_sales table intact.');
  }

  console.log('\nDeletion complete.');
}

main().catch(err => { console.error('\nDeletion failed:', err.message); process.exit(1); });
