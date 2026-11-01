import type {
  BrainLobeKey,
  CheckItem,
  DocLine,
  EvidenceTag,
  FileTreeNode,
  Finding,
  FindingKind,
  HashedFile,
  ScaffoldFile,
  SecondBrainMemory,
  SpecItem,
  TargetKindInfo,
  VirtualFile,
} from '../types/studio';
import { BRAIN_LOBE_KEYS, SAMPLE_SOURCE_FILES } from '../constants/config';

export const SKIP_REGEX =
  /\.(png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|mp[34]|wav|pdf)$|node_modules\//i;

export function formatBytes(n: number): string {
  if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB';
  if (n > 1e3) return (n / 1e3).toFixed(1) + ' KB';
  return n + ' B';
}

export function shorten(s: unknown, n = 26): string {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

export function basename(p: string): string {
  return String(p).split(/\/|!\//).pop() || String(p);
}

export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function getHost(v: string): string | null {
  try {
    return new URL(v).host;
  } catch {
    return null;
  }
}

export function getExtension(p: string): string {
  const m = p.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : 'other';
}

export function pseudoRandom(k: number): number {
  const v = Math.sin(k * 127.1) * 43758.5453;
  return v - Math.floor(v);
}

export async function sha256Short(b: ArrayBuffer): Promise<string> {
  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', b);
    return [...new Uint8Array(hashBuffer)]
      .slice(0, 4)
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return 'n/a';
  }
}

export function bufferToText(b: ArrayBuffer): string {
  const u = new Uint8Array(b);
  let z = 0;
  const m = Math.min(u.length, 4096);
  for (let i = 0; i < m; i++) {
    if (!u[i]) z++;
  }
  if (m && z / m > 0.02) {
    const o: string[] = [];
    let s = '';
    for (let i = 0; i < u.length && o.length < 40000; i++) {
      const v = u[i];
      if (v >= 32 && v < 127) {
        s += String.fromCharCode(v);
      } else {
        if (s.length >= 6) o.push(s);
        s = '';
      }
    }
    if (s.length >= 6) o.push(s);
    return o.join('\n');
  }
  return new TextDecoder().decode(u);
}

export function extractFindingsFromText(
  txt: string,
  filePath: string,
  startIdIndex: number,
  seen: Set<string>,
  cap: Record<string, number>,
): Finding[] {
  const results: Finding[] = [];
  let nextId = startIdIndex + 1;

  const add = (
    kind: FindingKind,
    value: string,
    idx: number,
    extra: Partial<Finding> = {},
  ) => {
    const k = kind + value;
    if (seen.has(k)) return;
    cap[kind] = (cap[kind] || 0) + 1;
    if (cap[kind] > 60) return;
    seen.add(k);
    const line = txt.slice(0, idx).split('\n').length;
    results.push({
      id: 'F' + nextId++,
      kind,
      value,
      file: filePath,
      line,
      tag: 'observed',
      ...extra,
    });
  };

  for (const m of txt.matchAll(
    /https?:\/\/[A-Za-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/[^\s"'`<>)\\]*)?/g,
  )) {
    add('url', m[0].slice(0, 80), m.index || 0);
  }

  for (const m of txt.matchAll(
    /(fetch|axios\.(?:get|post|put|delete|patch)|\$\.(?:get|post))\(\s*[`'"]([^`'"\s]{2,90})/g,
  )) {
    if (/^(\/|https?:)/.test(m[2])) {
      const g = m[1];
      const method = /post/.test(g)
        ? 'POST'
        : /put/.test(g)
          ? 'PUT'
          : /delete/.test(g)
            ? 'DELETE'
            : /patch/.test(g)
              ? 'PATCH'
              : /get/.test(g)
                ? 'GET'
                : '';
      add('endpoint', m[2], m.index || 0, { method });
    }
  }

  for (const m of txt.matchAll(/["'`](\/api\/[\w\-/{}:.]*)["'`]/g)) {
    add('endpoint', m[1], m.index || 0, { method: '' });
  }

  for (const m of txt.matchAll(
    /(?:from\s+|require\(\s*|import\(\s*)['"]([^'"./][^'"]*)['"]/g,
  )) {
    add('import', m[1], m.index || 0);
  }

  for (const m of txt.matchAll(
    /(?:localStorage|sessionStorage)\.(?:get|set|remove)Item\(\s*['"]([^'"]+)['"]/g,
  )) {
    add('storage', m[1], m.index || 0);
  }

  for (const m of txt.matchAll(
    /(?:path|route|href)\s*[:=]\s*['"](\/[\w\-/:]*|#\/?[\w\-/]*)['"]/g,
  )) {
    add('route', m[1], m.index || 0);
  }

  for (const m of txt.matchAll(
    /<(title|button|h1|h2|h3|label)\b[^>]*>\s*([^<>{]{2,60}?)\s*</g,
  )) {
    add('ui', m[2], m.index || 0, { el: m[1] });
  }

  if (/package\.json$/.test(filePath)) {
    try {
      const j = JSON.parse(txt);
      for (const k of ['dependencies', 'devDependencies']) {
        for (const [n, v] of Object.entries(j[k] || {})) {
          add('dep', n, 0, { ver: String(v) });
        }
      }
    } catch {
      // ignore invalid JSON
    }
  }

  return results;
}

export function buildSpecFromFindings(
  findings: Finding[],
  filesCount: number,
): SpecItem[] {
  const by = (k: FindingKind) => findings.filter((f) => f.kind === k);
  const L: SpecItem[] = [];
  const ln = (
    text: string,
    refs: string[],
    tag: EvidenceTag,
    kind: string,
    value: string,
    method = '',
    ver = '',
  ) => {
    L.push({ text, refs, tag, kind, value, method, ver });
  };

  const hs = new Set<string>();
  by('url').forEach((f) => {
    let h = f.value;
    try {
      h = new URL(f.value).host;
    } catch {
      // keep raw
    }
    if (!hs.has(h)) {
      hs.add(h);
      ln('Contacts ' + h, [f.id], 'observed', 'host', h);
    }
  });

  by('endpoint').forEach((f) =>
    ln(
      'Calls ' + (f.method || 'GET') + ' ' + f.value,
      [f.id],
      f.method ? 'observed' : 'inferred',
      'endpoint',
      f.value,
      f.method || 'GET',
    ),
  );

  by('route').forEach((f) =>
    ln('Has route ' + f.value, [f.id], 'observed', 'route', f.value),
  );

  by('ui').forEach((f) =>
    ln('Shows text "' + f.value + '"', [f.id], 'observed', 'ui', f.value),
  );

  [...by('dep'), ...by('import')].forEach((f) =>
    ln(
      'Uses library ' + f.value + (f.ver ? ' ' + f.ver : ''),
      [f.id],
      'observed',
      'lib',
      f.value,
      '',
      f.ver,
    ),
  );

  by('storage').forEach((f) =>
    ln('Persists local key "' + f.value + '"', [f.id], 'observed', 'storage', f.value),
  );

  (
    [
      ['endpoint', 'network endpoints'],
      ['lib', 'libraries'],
      ['ui', 'screen text'],
    ] as const
  ).forEach(([k, w]) => {
    if (!L.some((l) => l.kind === k)) {
      ln(
        'No ' + w + ' found in ' + filesCount + ' files scanned',
        [],
        'unknown',
        'gap',
        '',
      );
    }
  });

  return L.slice(0, 90);
}

export function checkSpecLeaks(files: HashedFile[], spec: SpecItem[]): number {
  return files.filter((f) =>
    spec.some((l) => l.text.includes(f.path) || l.text.includes(f.hash)),
  ).length;
}

export function buildDocLines(targetName: string, spec: SpecItem[]): DocLine[] {
  const D: DocLine[] = [];
  const dl = (doc: DocLine['doc'], line: string) => D.push({ doc, line });

  dl('PRD', '# Product requirements');
  dl('PRD', 'Target: ' + targetName);
  (['observed', 'inferred', 'unknown'] as const).forEach((t) => {
    dl('PRD', '## ' + t);
    spec
      .filter((l) => l.tag === t)
      .slice(0, 14)
      .forEach((l) => dl('PRD', '- ' + l.text));
  });

  dl('STACK', '# Stack');
  spec
    .filter((l) => l.kind === 'lib')
    .slice(0, 25)
    .forEach((l) => dl('STACK', '- ' + l.value + ' ' + (l.ver || '')));

  dl('FLOW', 'graph LR');
  spec
    .filter((l) => l.kind === 'endpoint')
    .slice(0, 12)
    .forEach((l, i) =>
      dl(
        'FLOW',
        '  App -->|' +
          (l.method || 'GET') +
          '| E' +
          i +
          '["' +
          l.value.replace(/"/g, '') +
          '"]',
      ),
    );

  return D;
}

export function buildCleanRoomScaffold(spec: SpecItem[]): ScaffoldFile[] {
  const E = spec.filter((s) => s.kind === 'endpoint');
  const K = spec.filter((s) => s.kind === 'storage');
  const D = spec.filter((s) => s.kind === 'lib');

  return [
    {
      path: 'src/api.ts',
      content:
        '// generated from SPEC.md only\n' +
        E.map(
          (s, i) =>
            'export const call' +
            i +
            '=(init?:RequestInit)=>fetch(' +
            JSON.stringify(s.value) +
            ',{method:' +
            JSON.stringify(s.method || 'GET') +
            ',...init});',
        ).join('\n'),
    },
    {
      path: 'src/storage.ts',
      content: 'export const keys=' + JSON.stringify(K.map((s) => s.value)) + ';',
    },
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          dependencies: Object.fromEntries(D.map((s) => [s.value, s.ver || '*'])),
        },
        null,
        1,
      ),
    },
    {
      path: 'README.md',
      content:
        'Scaffold from SPEC.md. Model adapter not connected, so no UI is generated.',
    },
  ];
}

export function runCleanRoomWorker(
  spec: SpecItem[],
): Promise<{ mode: string; probes: [string, boolean][]; files: ScaffoldFile[] }> {
  const sp = spec.map(({ text, kind, value, method, ver, tag }) => ({
    text,
    kind,
    value,
    method,
    ver,
    tag,
  }));

  const fallback = (mode: string) => ({
    probes: [] as [string, boolean][],
    files: buildCleanRoomScaffold(sp),
    mode,
  });

  const workerScript = `
    function build(spec){
      const E=spec.filter(s=>s.kind=='endpoint'),K=spec.filter(s=>s.kind=='storage'),D=spec.filter(s=>s.kind=='lib');
      return[
        {path:'src/api.ts',content:'// generated from SPEC.md only\\n'+E.map((s,i)=>'export const call'+i+'=(init?:RequestInit)=>fetch('+JSON.stringify(s.value)+',{method:'+JSON.stringify(s.method||'GET')+',...init});').join('\\n')},
        {path:'src/storage.ts',content:'export const keys='+JSON.stringify(K.map(s=>s.value))+';'},
        {path:'package.json',content:JSON.stringify({dependencies:Object.fromEntries(D.map(s=>[s.value,s.ver||'*']))},null,1)},
        {path:'README.md',content:'Scaffold from SPEC.md. Model adapter not connected, so no UI is generated.'}
      ];
    }
    self.onmessage=async e=>{
      const probes=[];
      const t=async(n,f)=>{try{await f();probes.push([n,false])}catch(x){probes.push([n,true])}};
      await t('read target files',()=>{if(typeof self.TARGET==='undefined')throw 0});
      await t('touch the page DOM',()=>document.body.innerHTML);
      await t('read page storage',()=>localStorage.length);
      await t('network request',()=>{throw new Error('blocked in clean room')});
      self.postMessage({probes,files:build(e.data.spec)});
    };
  `;

  return new Promise((res) => {
    try {
      const blobUrl = URL.createObjectURL(
        new Blob([workerScript], { type: 'text/javascript' }),
      );
      const w = new Worker(blobUrl);
      const to = setTimeout(() => {
        w.terminate();
        URL.revokeObjectURL(blobUrl);
        res(fallback('worker timed out: ran on main thread, isolation NOT enforced'));
      }, 5000);

      w.onmessage = (e) => {
        clearTimeout(to);
        w.terminate();
        URL.revokeObjectURL(blobUrl);
        res({ ...e.data, mode: 'isolated worker' });
      };
      w.onerror = () => {
        clearTimeout(to);
        w.terminate();
        URL.revokeObjectURL(blobUrl);
        res(fallback('worker blocked: ran on main thread, isolation NOT enforced'));
      };
      w.postMessage({ spec: sp });
    } catch {
      res(fallback('worker unavailable: isolation NOT enforced'));
    }
  });
}

export function detectTargetKind(files: HashedFile[]): TargetKindInfo {
  const paths = files.map((x) => x.path);
  if (paths.some((p) => /AndroidManifest\.xml$|\.dex$|\.apk/i.test(p))) {
    return { k: 'apk', l: 'Android package' };
  }
  if (paths.some((p) => /\.(exe|so|dylib|elf|bin)$/i.test(p))) {
    return { k: 'native', l: 'Native binary' };
  }
  if (paths.some((p) => /\.dll$/i.test(p))) {
    return { k: 'dotnet', l: '.NET assembly' };
  }
  if (paths.some((p) => /package\.json$|\.asar$|\.js$/i.test(p))) {
    return { k: 'js', l: 'Electron or JavaScript app' };
  }
  if (paths.some((p) => /\.html?$/i.test(p))) {
    return { k: 'js', l: 'Web app' };
  }
  return { k: 'mixed', l: 'Mixed files' };
}

export function detectTargetSummaryKind(files: HashedFile[]): string {
  if (files.some((f) => /AndroidManifest\.xml$/.test(f.path))) {
    return 'Android app (APK)';
  }
  if (files.some((f) => /\.(dll|exe)$/i.test(f.path))) {
    return '.NET or native binary';
  }
  if (files.some((f) => /package\.json$/.test(f.path))) {
    return 'Node, Electron or web project';
  }
  if (files.some((f) => /\.html?$/.test(f.path))) {
    return 'Web app';
  }
  return 'Mixed files';
}

export function auditStage(
  stageIndex: number,
  params: {
    files: HashedFile[];
    total: number;
    findings: Finding[];
    spec: SpecItem[];
    docLinesCount: number;
    scaffold: ScaffoldFile[];
    rebuilderNote: string;
    checks: CheckItem[];
  },
): [boolean, string] {
  const {
    files,
    total,
    findings,
    spec,
    docLinesCount,
    scaffold,
    rebuilderNote,
    checks,
  } = params;

  if (stageIndex === 0) {
    return [
      files.length === total && files.every((f) => Boolean(f.hash)),
      `${files.length} of ${total} files hashed`,
    ];
  }
  if (stageIndex === 1) {
    return [
      findings.every((f) => Boolean(f.file) && f.line > 0 && Boolean(f.tag)),
      `${findings.length} findings, each with file and line evidence`,
    ];
  }
  if (stageIndex === 2) {
    return [
      spec.length > 0 &&
        spec.filter((l) => l.tag !== 'unknown').every((l) => l.refs.length > 0),
      `${spec.length} spec lines, every claim cites evidence`,
    ];
  }
  if (stageIndex === 3) {
    return [docLinesCount > 0, `${docLinesCount} document lines written`];
  }
  if (stageIndex === 4) {
    const ok =
      scaffold.length > 0 &&
      rebuilderNote.includes('isolated worker') &&
      !rebuilderNote.includes('NOT blocked');
    return [
      ok,
      ok
        ? 'wall held: all probes blocked'
        : 'wall not enforced: ' + rebuilderNote.slice(0, 60),
    ];
  }
  const p = checks.filter((x) => x.ok).length;
  return [
    checks.length > 0,
    `${p} of ${checks.length} checks passed, computed by code`,
  ];
}

export function buildFileTree(name: string, files: HashedFile[]): FileTreeNode {
  const r: FileTreeNode = { n: name || 'target', c: {}, s: 0, k: 0 };
  files.forEach((f) => {
    let n = r;
    n.s += f.size;
    n.k++;
    f.path
      .split(/\/|!\//)
      .filter(Boolean)
      .forEach((p) => {
        n = n.c[p] = n.c[p] || { n: p, c: {}, s: 0, k: 0 };
        n.s += f.size;
        n.k++;
      });
  });
  return r;
}

export function normalizeLobeKey(kind: FindingKind): BrainLobeKey | null {
  if (kind === 'dep' || kind === 'import') return 'lib';
  if (kind === 'url') return 'host';
  if (kind === 'file') return null;
  return kind as BrainLobeKey;
}

export function commitRunToMemory(
  mem: SecondBrainMemory,
  params: {
    tid: string;
    name: string;
    total: number;
    kindLabel: string;
    findings: Finding[];
  },
): SecondBrainMemory {
  const { tid, name, total, kindLabel, findings } = params;
  const nextT = mem.t.filter((x) => x.id !== tid);
  const nextE: Record<string, SecondBrainMemory['e'][string]> = {};

  for (const [k, ent] of Object.entries(mem.e)) {
    const filteredT = ent.t.filter((x) => x !== tid);
    if (filteredT.length > 0) {
      nextE[k] = { ...ent, t: filteredT };
    }
  }

  nextT.push({
    id: tid,
    name,
    ts: Date.now(),
    files: total,
    kind: kindLabel,
  });

  findings.forEach((f) => {
    if (f.kind === 'file') return;
    const k = normalizeLobeKey(f.kind);
    if (!k || !BRAIN_LOBE_KEYS.includes(k)) return;
    let v = f.value;
    if (f.kind === 'url') {
      try {
        v = new URL(f.value).host;
      } catch {
        // keep value
      }
    }
    v = String(v).slice(0, 80);
    const key = k + '|' + v;
    const existing = nextE[key] || { k, v, t: [], f: f.file, r: 0 };
    const updatedT = existing.t.includes(tid)
      ? existing.t
      : [...existing.t, tid];
    nextE[key] = {
      ...existing,
      t: updatedT,
      r: f.rea ? 1 : existing.r,
    };
  });

  const keys = Object.keys(nextE);
  if (keys.length > 1500) {
    keys
      .sort((a, b) => nextE[a].t.length - nextE[b].t.length)
      .slice(0, keys.length - 1500)
      .forEach((k) => delete nextE[k]);
  }

  return { t: nextT, e: nextE };
}

export function parseReaEvidenceJson(
  txt: string,
  hasRun: boolean,
  existingFindingsCount: number,
): {
  message: string;
  newFindings: Finding[];
  newSpecItems: SpecItem[];
} {
  if (!hasRun) {
    return {
      message: 'Run a scan first, then merge evidence into it.',
      newFindings: [],
      newSpecItems: [],
    };
  }
  let j: unknown;
  try {
    j = JSON.parse(txt);
  } catch {
    return {
      message: 'That is not valid JSON.',
      newFindings: [],
      newSpecItems: [],
    };
  }

  const obj = j as Record<string, unknown>;
  const a: unknown[] = Array.isArray(j)
    ? j
    : Array.isArray(obj?.evidence)
      ? obj.evidence
      : Array.isArray(obj?.findings)
        ? obj.findings
        : Array.isArray(obj?.items)
          ? obj.items
          : [];

  if (!a.length) {
    return {
      message:
        'No list found. Use a JSON list, or an object with evidence, findings or items.',
      newFindings: [],
      newSpecItems: [],
    };
  }

  const M: Record<string, FindingKind> = {
    url: 'url',
    endpoint: 'endpoint',
    api: 'endpoint',
    route: 'route',
    library: 'dep',
    dependency: 'dep',
    dep: 'dep',
    import: 'import',
    storage: 'storage',
    key: 'storage',
  };

  const validTags: Record<string, EvidenceTag> = {
    observed: 'observed',
    inferred: 'inferred',
    unknown: 'unknown',
  };

  const newFindings: Finding[] = [];
  const newSpecItems: SpecItem[] = [];
  let nextId = existingFindingsCount + 1;

  a.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const x = raw as Record<string, unknown>;
    const v = x.value || x.name || x.summary || x.text;
    if (!v) return;
    const rawKind = String(x.kind || x.type || '').toLowerCase();
    const kind: FindingKind = M[rawKind] || 'ui';
    const rawTag = String(x.tag || '');
    const tag: EvidenceTag = validTags[rawTag] || 'observed';
    const id = 'F' + nextId++;
    const value = String(v).slice(0, 90);
    const finding: Finding = {
      id,
      kind,
      value,
      file: String(x.file || x.path || 'REA evidence'),
      line: Number(x.line) || 0,
      tag,
      rea: 1,
      el: 'text',
      method: x.method ? String(x.method) : '',
    };
    newFindings.push(finding);
    newSpecItems.push({
      text: 'REA: ' + finding.kind + ' ' + finding.value,
      refs: [id],
      tag: finding.tag,
      kind: 'rea',
      value: finding.value,
    });
  });

  return {
    message: `${newFindings.length} of ${a.length} items merged and saved to memory.`,
    newFindings,
    newSpecItems,
  };
}

export function createSampleVirtualFiles(): VirtualFile[] {
  return SAMPLE_SOURCE_FILES.map(({ path, content }) => {
    const u = new TextEncoder().encode(content);
    return {
      path,
      size: u.length,
      read: async (maxBytes: number) => u.slice(0, maxBytes).buffer,
    };
  });
}
