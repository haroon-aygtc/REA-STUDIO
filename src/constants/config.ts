import { BOTS } from './botSprites';
import type {
  AgentConfig,
  BrainLobeKey,
  EvidenceTag,
  FindingKind,
  PackageTabId,
} from '../types/studio';

export const AGENTS: AgentConfig[] = [
  {
    id: 0,
    name: 'Intake',
    department: 'Receiving dock',
    color: '#7bd88f',
    spriteUrl: BOTS[0],
  },
  {
    id: 1,
    name: 'Analyst',
    department: 'Intelligence lab',
    color: '#a78bfa',
    spriteUrl: BOTS[1],
  },
  {
    id: 2,
    name: 'Spec Writer',
    department: 'Specification office',
    color: '#f6c99a',
    spriteUrl: BOTS[2],
  },
  {
    id: 3,
    name: 'Doc Agents',
    department: 'Documentation studio',
    color: '#7cb7ff',
    spriteUrl: BOTS[3],
  },
  {
    id: 4,
    name: 'Rebuilder',
    department: 'Clean room',
    color: '#9aa4c7',
    spriteUrl: BOTS[4],
  },
  {
    id: 5,
    name: 'Verifier',
    department: 'Testing ground',
    color: '#ff7fa0',
    spriteUrl: BOTS[5],
  },
];

export const SUPERVISOR_CONFIG: AgentConfig = {
  id: 6,
  name: 'Supervisor',
  department: 'Audit',
  color: '#f3efe8',
  spriteUrl: BOTS[6],
};

export const FINDING_COLORS: Record<FindingKind, string> = {
  file: '#ffb020',
  url: '#ff7a1a',
  endpoint: '#ff7a1a',
  import: '#f3efe8',
  dep: '#f3efe8',
  storage: '#ffd84d',
  route: '#ff4d2e',
  ui: '#c9c4bb',
};

export const TAG_COLORS: Record<EvidenceTag, string> = {
  observed: '#a3e635',
  inferred: '#fbbf24',
  unknown: '#ff4d2e',
};

export const EXTENSION_COLORS: Record<string, string> = {
  js: '#ffd84d',
  ts: '#6a98f4',
  tsx: '#6a98f4',
  html: '#ff7a1a',
  css: '#4fb3f0',
  json: '#a3e635',
  xml: '#c4b5fd',
  java: '#fb7185',
  class: '#fb7185',
  dex: '#f472b6',
  png: '#9a9184',
  so: '#ff4d2e',
  other: '#6b6459',
};

export const PACKAGE_TABS: [PackageTabId, string][] = [
  ['prd', 'PRD'],
  ['flow', 'User flow'],
  ['data', 'Data flow'],
  ['struct', 'Structure'],
  ['arch', 'Architecture'],
  ['stack', 'Stack'],
  ['proto', 'Prototype'],
  ['ver', 'Verification'],
];

export const STACK_CATEGORIES: [string, RegExp][] = [
  ['UI framework', /^(react|react-dom|vue|svelte|@angular|preact|solid)/],
  ['State and data', /redux|zustand|mobx|pinia|swr|query|rxjs/],
  ['Networking', /axios|^ky$|^got$|node-fetch|socket|^ws$|grpc/],
  ['Build and tooling', /vite|webpack|babel|esbuild|rollup|typescript|eslint|jest|vitest/],
  ['Styling and UI kit', /tailwind|styled|emotion|sass|mui|chakra|bootstrap/],
  ['Desktop and mobile', /electron|capacitor|cordova|expo|react-native/],
];

export const BRAIN_MEMORY_KEY = 'rea.second-brain.v1';

export const BRAIN_LOBE_KEYS: BrainLobeKey[] = [
  'host',
  'endpoint',
  'lib',
  'storage',
  'ui',
  'route',
];

export const BRAIN_LOBE_COLORS: Record<BrainLobeKey, string> = {
  host: '#fb7185',
  endpoint: '#ff9f43',
  lib: '#8ec5ff',
  storage: '#ffd84d',
  ui: '#c4b5fd',
  route: '#a3e635',
};

export const BRAIN_LOBE_LABELS: Record<BrainLobeKey, string> = {
  host: 'Hosts',
  endpoint: 'Endpoints',
  lib: 'Libraries',
  storage: 'Storage',
  ui: 'Screen text',
  route: 'Routes',
};

export const REA_MCP_CONFIG = `{
  "mcpServers": {
    "rea": { "command": "npx", "args": ["-y", "rea-agents@6.4.0", "mcp"] }
  }
}`;

export const REA_PLAYBOOKS: Record<string, string[]> = {
  apk: [
    'inspect_android_package: manifest, components, permissions, bundled libraries.',
    'analyze_javascript_application when the app bundles JavaScript (React Native, WebView).',
    'open_binary on native libraries inside the package.',
  ],
  js: [
    'analyze_javascript_application: bundles, routes, API calls, IPC between main and renderer.',
    'Read package.json to confirm Electron entry points and dependencies.',
    'Ask REA for runtime or network capture tools if the app must be run.',
  ],
  native: [
    'open_binary to load the executable.',
    'analyze_function on functions near the strings and endpoints this Studio already found.',
    'Native decompilation may need Ghidra, Hopper or IDA, depending on the REA version.',
  ],
  dotnet: [
    'REA lists .NET assembly support. Ask it for its .NET tools first.',
    'Use the endpoints and strings found here as starting leads.',
  ],
  mixed: [
    'Ask REA to identify the format first, then pick the matching analysis tool.',
  ],
};

export const REA_STAGES: [string, string, string][] = [
  [
    'Intake',
    'Hashes files in the browser',
    'Identifies the format (APK, Electron, native, .NET)',
  ],
  [
    'Analyst',
    'Pattern scan for URLs, endpoints, libraries, storage keys, text',
    'Decompilation, call graphs, runtime and network captures, with evidence',
  ],
  ['Spec Writer', 'Writes SPEC.md from findings', 'Not used'],
  ['Doc Agents', 'Drafts PRD, stack and flow', 'Not used'],
  ['Rebuilder', 'Clean room, spec only', 'Never. No REA, no target'],
  [
    'Verifier',
    'Re-checks claims by code',
    'Optional: run the original side by side',
  ],
];

export const SAMPLE_SOURCE_FILES: { path: string; content: string }[] = [
  {
    path: 'index.html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>REA Reverse Engineering Studio</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
</head>
<body>
  <div id="launch">
    <h1>Choose a target</h1>
    <label class="auth"><input type="checkbox" id="ok"><span>I own this target or have written permission to examine it.</span></label>
    <button id="bf">Choose files or a zip, apk, jar</button>
    <button id="bd">Choose a folder</button>
    <button id="bs">Scan this page's own code (sample)</button>
  </div>
  <header>
    <span class="brand">REA Studio</span>
    <button id="again">New target</button>
  </header>
  <main>
    <h2>Operations floor</h2>
    <h2>Discovery map</h2>
    <h2>Link status</h2>
    <h2>Event stream</h2>
    <h2>Second brain · Neural Atlas</h2>
    <h2>REA console</h2>
    <button id="bre">Replay</button>
    <button id="bclr">Forget all</button>
    <button id="rgo">Merge evidence</button>
  </main>
</body>
</html>`,
  },
  {
    path: 'app.js',
    content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';

const routes = [
  { path: '/studio/operations', route: '/studio/operations' },
  { path: '/studio/package', route: '/studio/package' },
  { path: '/studio/neural-atlas', route: '/studio/neural-atlas' },
  { path: '/studio/rea-console', route: '/studio/rea-console' }
];

export async function syncTargetTelemetry() {
  const saved = localStorage.getItem('rea.second-brain.v1');
  localStorage.setItem('rea.second-brain.v1', saved || '{}');
  sessionStorage.setItem('rea.session.run', 'active');
  await fetch('https://example.com', { mode: 'no-cors' });
  await fetch('/api/targets/inspect', { method: 'POST' });
  await fetch('/api/spec/verify');
  const endpoint = "/api/evidence/merge";
  return { saved, endpoint, routes };
}

export function renderApp() {
  return (
    <div>
      <h1>Choose a target</h1>
      <h2>Project package</h2>
      <h3>Clickable prototype</h3>
      <label>Search memory</label>
      <button>Copy config</button>
      <button>Copy prompt</button>
      <button>Merge evidence</button>
    </div>
  );
}
`,
  },
  {
    path: 'package.json',
    content: JSON.stringify(
      {
        name: 'rea-reverse-engineering-studio',
        version: '1.0.0',
        dependencies: {
          react: '^19.0.1',
          'react-dom': '^19.0.1',
          jszip: '^3.10.1',
          'lucide-react': '^0.546.0',
        },
        devDependencies: {
          typescript: '^7.0.2',
          vite: '^8.3.0',
          tailwindcss: '^4.3.3',
        },
      },
      null,
      2,
    ),
  },
  {
    path: 'app.css',
    content: `:root { --bg: #0a0908; --panel: #100e0b; --line: #2f2a22; --tx: #f3efe8; --v: #ff7a1a; --c: #ffb020; }
body { background: var(--bg); color: var(--tx); }
.box { background: #13100d; border: 1px solid #28231b; border-radius: 14px; padding: 16px; }`,
  },
];
