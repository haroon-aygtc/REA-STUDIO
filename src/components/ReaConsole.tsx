import { useState } from 'react';
import {
  REA_MCP_CONFIG,
  REA_PLAYBOOKS,
  REA_STAGES,
} from '../constants/config';
import type { Finding, HashedFile } from '../types/studio';
import { detectTargetKind, uniq } from '../utils/analyzer';

interface ReaConsoleProps {
  name: string;
  total: number;
  files: HashedFile[];
  findings: Finding[];
  onMergeEvidence: (jsonText: string) => string;
}

export function ReaConsole({
  name,
  total,
  files,
  findings,
  onMergeEvidence,
}: ReaConsoleProps) {
  const [evidenceInput, setEvidenceInput] = useState('');
  const [mergeMessage, setMergeMessage] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const kindInfo = detectTargetKind(files);
  const topLeads = uniq(
    findings
      .filter((f) => ['endpoint', 'url'].includes(f.kind))
      .map((f) => f.value),
  ).slice(0, 8);

  const promptText = `Use REA to examine this ${total ? kindInfo.l : 'target'}${name ? ` ("${name}")` : ''}. I own it or have written permission.
Start from these leads found by a first-pass scan:
${topLeads.length ? topLeads.map((x) => '- ' + x).join('\n') : '- (none yet)'}
For each claim return JSON: {"kind","value","file","line","tag"} with tag observed, inferred or unknown, and name the REA tool that produced it.
List limitations and unknowns separately. Do not copy code, assets, fonts or branding.`;

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      setCopiedId(id);
    }
  };

  const playbookItems = REA_PLAYBOOKS[kindInfo.k] || REA_PLAYBOOKS.mixed;

  return (
    <section className="box" id="reac">
      <div className="th">
        <div>
          <h2>REA console</h2>
          <div className="mut">
            REA (morluto/rea) is a local MCP server and CLI. A web page cannot
            call it, so this panel prepares everything you need to run it for
            real and bring the evidence back.
          </div>
        </div>
        <span className="status-label" style={{ color: '#9a9184' }}>
          bridge: offline, built-in scanner active
        </span>
      </div>

      <div className="two2" style={{ marginTop: 14 }}>
        <div className="sec">
          <h3>1. Connect REA</h3>
          <p>
            Needs Node.js 22.19 or newer. Add this to your agent’s MCP config,
            or run <b>npx rea-agents setup</b>.
          </p>
          <pre id="rc1">{REA_MCP_CONFIG}</pre>
          <button
            type="button"
            onClick={() => handleCopy('rc1', REA_MCP_CONFIG)}
          >
            {copiedId === 'rc1' ? 'Copied' : 'Copy config'}
          </button>
          <p className="mut" style={{ marginTop: 8 }}>
            Tool names and counts differ between REA versions. Check what your
            install lists, for example with <b>rea doctor --json</b>, and use
            that list.
          </p>
        </div>

        <div className="sec">
          <h3>2. Playbook for this target ({kindInfo.l})</h3>
          {playbookItems.map((x, idx) => (
            <div className="ln" key={idx} style={{ marginBottom: 6 }}>
              {x}
            </div>
          ))}
          <p className="mut" style={{ marginTop: 8 }}>
            REA keeps evidence, graphs, limitations and unknowns apart. Studio
            maps them to observed, inferred and unknown.
          </p>
        </div>
      </div>

      <div className="sec">
        <h3>3. Where REA adds the most</h3>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Studio does today</th>
              <th>REA adds</th>
            </tr>
          </thead>
          <tbody>
            {REA_STAGES.map(([agent, studio, rea]) => (
              <tr key={agent}>
                <td>
                  <b>{agent}</b>
                </td>
                <td>{studio}</td>
                <td>{rea}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="two2">
        <div className="sec">
          <h3>4. Prompt for your agent</h3>
          <pre id="rc2">{promptText}</pre>
          <button type="button" onClick={() => handleCopy('rc2', promptText)}>
            {copiedId === 'rc2' ? 'Copied' : 'Copy prompt'}
          </button>
        </div>

        <div className="sec">
          <h3>5. Bring REA evidence back</h3>
          <p>
            Paste a JSON list. Each item needs a value; kind, file, line and tag
            are optional. Items merge into this run and into memory, marked REA.
          </p>
          <textarea
            id="rin"
            aria-label="REA JSON evidence input"
            placeholder='[{"kind":"endpoint","value":"/api/login","file":"main.js","line":42,"tag":"observed"}]'
            value={evidenceInput}
            onChange={(e) => setEvidenceInput(e.target.value)}
          />
          <button
            type="button"
            id="rgo"
            style={{ marginTop: 8 }}
            onClick={() => {
              const msg = onMergeEvidence(evidenceInput);
              setMergeMessage(msg);
            }}
          >
            Merge evidence
          </button>
          {mergeMessage && (
            <p id="rmsg" className="mut" style={{ marginTop: 8 }}>
              {mergeMessage}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
