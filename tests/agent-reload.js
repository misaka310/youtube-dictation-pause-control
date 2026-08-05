#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
const background = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'extension', 'agent-reload.js'), 'utf8');
const script = fs.readFileSync(path.join(root, 'scripts', 'reload-extension.ps1'), 'utf8');
const combined = `${client}\n${script}`.toLowerCase();

assert.ok(manifest.permissions.includes('alarms'));
assert.ok(manifest.permissions.includes('storage'));
assert.ok(manifest.host_permissions.includes('http://127.0.0.1:18793/*'));
assert.match(background, /importScripts\('agent-reload\.js'\)/);
assert.match(client, /chrome\.runtime\.reload\(\)/);
assert.match(combined, /expectedbuildid/);
assert.doesNotMatch(combined, /chrome:\/\/extensions/);
assert.doesNotMatch(combined, /setforegroundwindow|sendkeys/);

console.log('Agent extension reload contract: PASS');
