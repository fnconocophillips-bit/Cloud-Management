#!/usr/bin/env node
/**
 * Creates the Vehicle Sales Tracker application menu and modules in ServiceNow.
 * Idempotent — skips creation if the menu already exists, upserts modules.
 *
 * Usage:
 *   node create_app_menu.js
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

async function getOrCreateMenu(menu) {
  // sys_app_application is the correct table for Application Menus in the navigator
  const check = await snRequest(
    'GET',
    `/api/now/table/sys_app_application?sysparm_query=title=${encodeURIComponent(menu.name)}&sysparm_limit=1&sysparm_fields=sys_id,title`
  );

  if (check.body && check.body.result && check.body.result.length > 0) {
    const sysId = check.body.result[0].sys_id;
    console.log(`  Application menu already exists (sys_id = ${sysId}), reusing.`);
    return sysId;
  }

  console.log(`  Creating application menu: ${menu.name}...`);
  const res = await snRequest('POST', '/api/now/table/sys_app_application', {
    title:       menu.name,
    description: menu.description,
    active:      'true',
    category:    menu.category
  });

  if (res.status >= 400) {
    throw new Error(`Application menu creation failed (${res.status}): ${JSON.stringify(res.body)}`);
  }

  const sysId = res.body.result && res.body.result.sys_id;
  console.log(`  Application menu created (sys_id = ${sysId})`);
  return sysId;
}

async function upsertModule(appSysId, mod) {
  // Check if module already exists for this app with the same title
  const check = await snRequest(
    'GET',
    `/api/now/table/sys_app_module?sysparm_query=application=${appSysId}^title=${encodeURIComponent(mod.title)}&sysparm_limit=1&sysparm_fields=sys_id`
  );

  const payload = {
    application: appSysId,
    title:       mod.title,
    active:      mod.active ? 'true' : 'false',
    order:       String(mod.order)
  };

  if (mod.type === 'list') {
    payload.link_type = 'LIST';
    payload.name      = mod.table;
    if (mod.filter) payload.query = mod.filter;
  } else if (mod.type === 'new_record') {
    payload.link_type = 'NEW';
    payload.name      = mod.table;
  } else if (mod.type === 'url') {
    payload.link_type = 'URL';
    payload.href      = mod.url;
  }

  if (check.body && check.body.result && check.body.result.length > 0) {
    const existingSysId = check.body.result[0].sys_id;
    const res = await snRequest('PATCH', `/api/now/table/sys_app_module/${existingSysId}`, payload);
    console.log(`  PATCH  ${mod.title} → ${res.status}`);
  } else {
    const res = await snRequest('POST', '/api/now/table/sys_app_module', payload);
    console.log(`  POST   ${mod.title} → ${res.status}`);
    if (res.status >= 400) {
      console.error(`         Error: ${JSON.stringify(res.body)}`);
    }
  }
}

async function main() {
  const menu = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../src/app_menu/application_menu.json'), 'utf8')
  ).application;

  console.log(`\nDeploying application menu: ${menu.name}`);
  console.log(`Instance: ${INSTANCE}.service-now.com\n`);

  const appSysId = await getOrCreateMenu(menu);

  const deployableModules = menu.modules.filter(m => m.type !== 'separator' && m.type !== 'report');
  console.log(`\nUpserting ${deployableModules.length} modules...`);

  for (const mod of deployableModules) {
    await upsertModule(appSysId, mod);
  }

  console.log('\nApplication menu deployment complete.');
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
