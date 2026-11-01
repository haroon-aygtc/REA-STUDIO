import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditStage,
  buildCleanRoomScaffold,
  buildDocLines,
  buildFileTree,
  buildSpecFromFindings,
  checkSpecLeaks,
  commitRunToMemory,
  detectTargetKind,
  extractFindingsFromText,
  formatBytes,
  parseReaEvidenceJson,
} from './analyzer';
import type { HashedFile } from '../types/studio';

test('formatBytes formats B, KB, and MB accurately', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(4500), '4.5 KB');
  assert.equal(formatBytes(2500000), '2.5 MB');
});

test('extractFindingsFromText extracts URLs, endpoints, imports, storage keys, routes, and UI texts', () => {
  const sampleJs = `
    import React from 'react';
    const route = '/dashboard/overview';
    async function load() {
      localStorage.setItem('auth.token', '123');
      await fetch('https://api.example.com/v1/status');
      await fetch('/api/items', { method: 'POST' });
    }
    const html = "<h1>Studio Overview</h1><button>Run Scan</button>";
  `;
  const seen = new Set<string>();
  const cap: Record<string, number> = {};
  const findings = extractFindingsFromText(sampleJs, 'src/app.js', 0, seen, cap);

  assert.equal(findings.some((f) => f.kind === 'import' && f.value === 'react'), true);
  assert.equal(
    findings.some((f) => f.kind === 'route' && f.value === '/dashboard/overview'),
    true,
  );
  assert.equal(
    findings.some((f) => f.kind === 'storage' && f.value === 'auth.token'),
    true,
  );
  assert.equal(
    findings.some(
      (f) => f.kind === 'url' && f.value === 'https://api.example.com/v1/status',
    ),
    true,
  );
  assert.equal(
    findings.some((f) => f.kind === 'endpoint' && f.value === '/api/items'),
    true,
  );
  assert.equal(
    findings.some((f) => f.kind === 'ui' && f.value === 'Studio Overview'),
    true,
  );
  assert.equal(
    findings.some((f) => f.kind === 'ui' && f.value === 'Run Scan'),
    true,
  );
});

test('buildSpecFromFindings and checkSpecLeaks generate clean-room spec without leaking paths or hashes', () => {
  const seen = new Set<string>();
  const cap: Record<string, number> = {};
  const findings = extractFindingsFromText(
    `import axios from 'axios'; fetch('/api/users'); localStorage.getItem('theme'); <h1>Hello</h1>`,
    'secret/internal/path.js',
    0,
    seen,
    cap,
  );
  const files: HashedFile[] = [
    { path: 'secret/internal/path.js', size: 120, hash: 'deadbeef' },
  ];
  const spec = buildSpecFromFindings(findings, files.length);
  assert.equal(spec.length > 0, true);
  assert.equal(checkSpecLeaks(files, spec), 0);

  const scaffold = buildCleanRoomScaffold(spec);
  assert.equal(scaffold.length, 4);
  assert.equal(
    scaffold.find((f) => f.path === 'src/api.ts')?.content.includes('/api/users'),
    true,
  );
  assert.equal(
    scaffold.find((f) => f.path === 'src/storage.ts')?.content.includes('theme'),
    true,
  );

  const docs = buildDocLines('sample-target', spec);
  assert.equal(docs.some((d) => d.doc === 'PRD'), true);
  assert.equal(docs.some((d) => d.doc === 'STACK'), true);
  assert.equal(docs.some((d) => d.doc === 'FLOW'), true);
});

test('detectTargetKind and buildFileTree classify files and compute hierarchy', () => {
  const apkFiles: HashedFile[] = [
    { path: 'app!/AndroidManifest.xml', size: 1024, hash: '11223344' },
    { path: 'app!/classes.dex', size: 4096, hash: '55667788' },
  ];
  assert.equal(detectTargetKind(apkFiles).k, 'apk');

  const tree = buildFileTree('my-apk', apkFiles);
  assert.equal(tree.s, 5120);
  assert.equal(tree.k, 2);
});

test('parseReaEvidenceJson validates and merges external REA JSON findings', () => {
  const noRun = parseReaEvidenceJson('[]', false, 0);
  assert.equal(noRun.newFindings.length, 0);

  const valid = parseReaEvidenceJson(
    JSON.stringify([
      {
        kind: 'endpoint',
        value: '/api/v2/login',
        file: 'auth.js',
        line: 42,
        tag: 'observed',
      },
    ]),
    true,
    10,
  );
  assert.equal(valid.newFindings.length, 1);
  assert.equal(valid.newFindings[0].id, 'F11');
  assert.equal(valid.newFindings[0].value, '/api/v2/login');
  assert.equal(valid.newFindings[0].rea, 1);
});

test('auditStage and commitRunToMemory validate stages and persist neural atlas bridges', () => {
  const files: HashedFile[] = [{ path: 'index.html', size: 100, hash: 'a1b2c3d4' }];
  const [ok0] = auditStage(0, {
    files,
    total: 1,
    findings: [],
    spec: [],
    docLinesCount: 0,
    scaffold: [],
    rebuilderNote: '',
    checks: [],
  });
  assert.equal(ok0, true);

  const mem1 = commitRunToMemory(
    { t: [], e: {} },
    {
      tid: 't1',
      name: 'Target A',
      total: 1,
      kindLabel: 'Web app',
      findings: [
        {
          id: 'F1',
          kind: 'endpoint',
          value: '/api/shared',
          file: 'a.js',
          line: 1,
          tag: 'observed',
        },
      ],
    },
  );
  const mem2 = commitRunToMemory(mem1, {
    tid: 't2',
    name: 'Target B',
    total: 2,
    kindLabel: 'Web app',
    findings: [
      {
        id: 'F1',
        kind: 'endpoint',
        value: '/api/shared',
        file: 'b.js',
        line: 5,
        tag: 'observed',
      },
    ],
  });
  assert.equal(mem2.t.length, 2);
  assert.deepEqual(mem2.e['endpoint|/api/shared'].t, ['t1', 't2']);
});
