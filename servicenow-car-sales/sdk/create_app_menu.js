#!/usr/bin/env node
/**
 * Creates the Vehicle Sales Tracker application menu and modules in ServiceNow.
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

async function main() {
  const menu = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../src/app_menu/application_menu.json'), 'utf8')
  ).application;

  console.log(`Creating application: ${menu.name}...`);
  const appRes = await snRequest('POST', '/api/now/table/sys_app_application', {
    title:       menu.name,
    description: menu.description,
    active:      'true',
    category:    menu.category
  });

  if (appRes.status >= 400) {
    throw new Error(`Application creation failed (${appRes.status}): ${JSON.stringify(appRes.body)}`);
  }

  const appSysId = appRes.body.result && appRes.body.result.sys_id;
  console.log(`  Application created: sys_id = ${appSysId}`);

  const modules = menu.modules.filter(m => m.type !== 'separator' && m.type !== 'report');

  for (const mod of modules) {
    console.log(`  Adding module: ${mod.title}...`);

    const payload = {
      application:  appSysId,
      title:        mod.title,
      active:       mod.active ? 'true' : 'false',
      order:        String(mod.order)
    };

    if (mod.type === 'list') {
      payload.link_type = 'LIST';
      payload.name      = mod.table;
      if (mod.filter) payload.filter = mod.filter;
    } else if (mod.type === 'new_record') {
      payload.link_type = 'NEW';
      payload.name      = mod.table;
    } else if (mod.type === 'url') {
      payload.link_type = 'URL';
      payload.href      = mod.url;
    }

    const modRes = await snRequest('POST', '/api/now/table/sys_app_module', payload);
    console.log(`    Status: ${modRes.status}`);
  }

  console.log('\nApplication menu created successfully.');
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
