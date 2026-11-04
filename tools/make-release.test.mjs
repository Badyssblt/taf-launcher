import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { makeRelease } from './make-release.mjs';

test('decoupe un build en archives et le manifeste permet de tout reconstituer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'taf-release-'));
  const build = join(root, 'build');
  const out = join(root, 'out');
  await mkdir(join(build, 'Game/Content'), { recursive: true });
  const files = {
    'Game/Content/big.pak': randomBytes(2_500_000),
    'Game/Game.exe': randomBytes(120_000),
    'readme.txt': Buffer.from('bonjour'),
    'vide.dat': Buffer.alloc(0),
    '.launcher-install.json': Buffer.from('{}'),
  };
  for (const [p, data] of Object.entries(files)) await writeFile(join(build, p), data);

  const m = await makeRelease({ dir: build, game: 'demo', version: '1.2.3', repo: 'acme/demo', out, partSize: 1_000_000 });

  assert.equal(m.schema, 1);
  assert.equal(m.files.length, 4, 'le fichier d etat du launcher est exclu');
  assert.ok(m.parts.length >= 3);
  assert.ok(m.parts.every((p) => p.size <= 1_000_000));
  assert.equal(m.parts[0].url, 'https://github.com/acme/demo/releases/download/v1.2.3/demo-1.2.3.part001');
  assert.equal(m.totalSize, m.parts.reduce((s, p) => s + p.size, 0));

  // Reconstitution : on relit le flux a partir des archives, comme le fait le launcher.
  const stream = Buffer.concat(await Promise.all(m.parts.map((p) => readFile(join(out, p.name)))));
  for (const f of m.files) {
    const slice = stream.subarray(f.offset, f.offset + f.size);
    assert.equal(createHash('sha256').update(slice).digest('hex'), f.sha256, f.path);
    assert.deepEqual(slice, files[f.path]);
  }
  await rm(root, { recursive: true, force: true });
});

test('refuse une taille d archive superieure a la limite GitHub', async () => {
  await assert.rejects(makeRelease({ dir: '.', game: 'demo', version: '1', repo: 'a/b', out: join(tmpdir(), 'x'), partSize: 3_000_000_000 }), /2 Go/);
});
