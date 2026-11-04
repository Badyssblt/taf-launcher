#!/usr/bin/env node
// Prepare la release d'un jeu pour le launcher : decoupe un dossier de build en archives de moins de 2 Go
// (limite des fichiers d'une release GitHub) et genere manifest.json.
//
//   node tools/make-release.mjs --dir D:/Builds/Taf/Windows --game taf --version 1.4.0 \
//        --repo Badyssblt/taf --out D:/Releases/taf-1.4.0 [--prerelease] [--part-size-mb 1900]
//
// Puis : creer la release GitHub `v1.4.0` du depot (cocher "pre-release" pour le canal beta) et y deposer TOUS les
// fichiers du dossier --out (manifest.json + taf-1.4.0.partNNN). Le backend lit le manifeste de la derniere release.
//
// Format (schema 1) : les fichiers du jeu sont mis bout a bout dans un flux ; `offset` = position du fichier dans
// ce flux ; le flux est coupe en `parts` consecutives (les fichiers peuvent chevaucher deux archives).

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';

export const MAX_PART_BYTES = 2_000_000_000; // < 2 GiB, marge de securite

async function* walk(dir) {
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
}

export async function makeRelease({ dir, game, version, repo, out, tag = `v${version}`, partSize = 1_900 * 1024 * 1024, exclude = [] }) {
  if (partSize > MAX_PART_BYTES) throw new Error('part-size trop grand (limite GitHub : 2 Go)');
  if (!/^[a-z0-9-]+$/.test(game)) throw new Error('--game : minuscules, chiffres et tirets');
  const excluded = exclude.map((p) => new RegExp(p, 'i'));
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const parts = [];
  let current = null; // { name, stream, size }
  const openPart = () => {
    const name = `${game}-${version}.part${String(parts.length + 1).padStart(3, '0')}`;
    const part = { name, stream: createWriteStream(join(out, name)), size: 0 };
    parts.push(part);
    return part;
  };
  const write = async (part, chunk) => {
    if (!part.stream.write(chunk)) await once(part.stream, 'drain');
    part.size += chunk.length;
  };
  const closePart = async (part) => {
    part.stream.end();
    await once(part.stream, 'close');
  };

  const files = [];
  let offset = 0;
  for await (const full of walk(dir)) {
    const rel = relative(dir, full).split(sep).join('/');
    if (rel === '.launcher-install.json' || excluded.some((r) => r.test(rel))) continue;
    const { size } = await stat(full);
    const hash = createHash('sha256');
    if (size > 0) {
      for await (let chunk of createReadStream(full, { highWaterMark: 4 * 1024 * 1024 })) {
        hash.update(chunk);
        while (chunk.length) {
          current ??= openPart();
          const room = partSize - current.size;
          const piece = chunk.subarray(0, room);
          await write(current, piece);
          chunk = chunk.subarray(piece.length);
          if (current.size >= partSize) {
            await closePart(current);
            current = null;
          }
        }
      }
    } else {
      hash.update('');
    }
    files.push({ path: rel, size, sha256: hash.digest('hex'), offset });
    offset += size;
    process.stdout.write(`\r${files.length} fichiers, ${(offset / 1024 / 1024).toFixed(0)} Mo   `);
  }
  if (current) await closePart(current);
  process.stdout.write('\n');

  const manifest = {
    schema: 1,
    game,
    version,
    totalSize: offset,
    parts: parts.map((p) => ({
      name: p.name,
      url: `https://github.com/${repo}/releases/download/${tag}/${p.name}`,
      size: p.size,
    })),
    files,
  };
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'prerelease') args[key] = true;
    else if (key === 'exclude') (args.exclude ??= []).push(argv[++i]);
    else args[key] = argv[++i];
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  for (const k of ['dir', 'game', 'version', 'repo', 'out']) {
    if (!a[k]) {
      console.error('Usage : node make-release.mjs --dir <build> --game <slug> --version <x.y.z> --repo <proprietaire/depot> --out <dossier> [--exclude <regex>] [--part-size-mb 1900]');
      process.exit(1);
    }
  }
  const m = await makeRelease({
    dir: a.dir,
    game: a.game,
    version: a.version,
    repo: a.repo,
    out: a.out,
    tag: a.tag,
    partSize: a['part-size-mb'] ? Number(a['part-size-mb']) * 1024 * 1024 : undefined,
    exclude: a.exclude,
  });
  console.log(`\nManifeste : ${m.files.length} fichiers, ${(m.totalSize / 1024 / 1024 / 1024).toFixed(2)} Go en ${m.parts.length} archive(s).`);
  console.log(`Depose maintenant tous les fichiers de "${a.out}" dans la release ${a.tag ?? 'v' + a.version} de ${a.repo}${a.prerelease ? ' (pre-release = canal beta)' : ''}.`);
}
