#!/usr/bin/env node
// Liste ce qui a change dans le projet d'un jeu depuis sa derniere release publiee, pour rediger les notes de version.
//
//   node tools/changes-since-release.mjs --source "C:\...\Taf 5.8" --release-repo Badyssblt/taf [--base <commit>]
//
// Le point de depart est, dans l'ordre : --base, puis le repere `<!-- source-commit: HASH -->` ecrit dans les notes
// de la derniere release (le skill publier-version l'ajoute a chaque publication). Sortie : JSON sur stdout.
// Lecture seule : ne modifie ni le depot du jeu ni GitHub.

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });

export function parseMarker(body) {
  const m = /<!--\s*source-commit:\s*([0-9a-f]{7,40})\s*-->/i.exec(body ?? '');
  return m ? m[1] : null;
}

/** Zone fonctionnelle d'un fichier du projet Unreal (pour resumer ou ca a bouge). */
export function areaOf(path) {
  const p = path.replaceAll('\\', '/');
  let m = /^Source\/[^/]+\/Gameplay\/([^/]+)(?:\/([^/]+))?/.exec(p);
  if (m) return `Gameplay / ${m[2] && !m[2].includes('.') ? `${m[1]} / ${m[2]}` : m[1]}`;
  m = /^Source\/[^/]+\/([^/]+)\//.exec(p);
  if (m) return `Code / ${m[1]}`;
  m = /^Content\/([^/]+)(?:\/([^/]+))?/.exec(p);
  if (m) return `Contenu / ${m[2] && !m[2].includes('.') ? `${m[1]} / ${m[2]}` : m[1]}`;
  if (p.startsWith('Config/')) return 'Config';
  if (p.startsWith('Plugins/')) return 'Plugins';
  if (p === 'CLAUDE.md') return 'Documentation';
  return 'Autre';
}

export function collect({ source, base, releaseNotes }) {
  const head = git(source, 'rev-parse', 'HEAD').trim();
  const baseCommit = base ?? parseMarker(releaseNotes);
  if (!baseCommit) return { head, base: null, error: 'Aucun point de depart : donne --base <commit> ou ajoute le repere dans la release.' };
  const baseFull = git(source, 'rev-parse', '--verify', `${baseCommit}^{commit}`).trim();

  const raw = git(source, 'log', `${baseFull}..${head}`, '--no-merges', '--reverse', '--format=%x1e%H%x1f%aI%x1f%s%x1f%b');
  const commits = raw
    .split('\x1e')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [hash, date, subject, ...rest] = r.split('\x1f');
      return { hash: hash.slice(0, 9), date, subject, body: rest.join('\x1f').trim() };
    });

  const files = git(source, 'diff', '--name-status', `${baseFull}..${head}`).split('\n').filter(Boolean).map((l) => {
    const [status, ...p] = l.split('\t');
    return { status: status[0], path: p[p.length - 1] };
  });
  const areas = {};
  for (const f of files) areas[areaOf(f.path)] = (areas[areaOf(f.path)] ?? 0) + 1;

  const dirty = git(source, 'status', '--porcelain').split('\n').filter(Boolean);
  return {
    base: baseFull.slice(0, 9),
    head: head.slice(0, 9),
    headFull: head,
    commitCount: commits.length,
    commits,
    filesChanged: files.length,
    added: files.filter((f) => f.status === 'A').length,
    deleted: files.filter((f) => f.status === 'D').length,
    areas: Object.fromEntries(Object.entries(areas).sort((a, b) => b[1] - a[1])),
    uncommitted: dirty.length,
    uncommittedSample: dirty.slice(0, 8),
  };
}

async function latestRelease(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { 'user-agent': 'taf-launcher-tools' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 2) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1];
  return a;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.source) {
    console.error('Usage : node changes-since-release.mjs --source <dossier git du jeu> [--release-repo proprietaire/depot] [--base <commit>]');
    process.exit(1);
  }
  const release = a['release-repo'] ? await latestRelease(a['release-repo']) : null;
  const result = collect({ source: a.source, base: a.base, releaseNotes: release?.body });
  console.log(JSON.stringify({ lastRelease: release ? { tag: release.tag_name, publishedAt: release.published_at } : null, ...result }, null, 2));
}
