import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { areaOf, collect, parseMarker } from './changes-since-release.mjs';

const git = (dir, ...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });

test('lit le repere de commit dans les notes de release', () => {
  assert.equal(parseMarker('Notes\n<!-- source-commit: abc1234def -->'), 'abc1234def');
  assert.equal(parseMarker('rien ici'), null);
  assert.equal(parseMarker(undefined), null);
});

test('classe les fichiers par zone', () => {
  assert.equal(areaOf('Source/Taf/Gameplay/Jobs/Waiter/Foo.cpp'), 'Gameplay / Jobs / Waiter');
  assert.equal(areaOf('Source/Taf/Gameplay/Seating/ATafChair.h'), 'Gameplay / Seating');
  assert.equal(areaOf('Source/Taf/Core/TafCharacter.cpp'), 'Code / Core');
  assert.equal(areaOf('Content/UI/WBP_HUD.uasset'), 'Contenu / UI');
  assert.equal(areaOf('Content/Gameplay/Housing/BP_X.uasset'), 'Contenu / Gameplay / Housing');
  assert.equal(areaOf('Config/DefaultEngine.ini'), 'Config');
});

test('liste les commits et fichiers depuis le repere, et signale le travail non commite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'taf-changes-'));
  git(dir, 'init', '-q', '-b', 'main');
  mkdirSync(join(dir, 'Source/Taf/Core'), { recursive: true });
  writeFileSync(join(dir, 'Source/Taf/Core/A.cpp'), 'a');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'Version initiale');
  const base = git(dir, 'rev-parse', 'HEAD').trim();

  mkdirSync(join(dir, 'Source/Taf/Gameplay/Jobs'), { recursive: true });
  writeFileSync(join(dir, 'Source/Taf/Gameplay/Jobs/B.cpp'), 'b');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'Ajoute le metier de serveur', '-m', 'Details du metier.');
  writeFileSync(join(dir, 'Source/Taf/Core/A.cpp'), 'a2');
  git(dir, 'commit', '-q', '-am', 'Corrige le chargement');
  writeFileSync(join(dir, 'brouillon.txt'), 'pas commite');

  const r = collect({ source: dir, releaseNotes: `Notes\n<!-- source-commit: ${base.slice(0, 10)} -->` });
  assert.equal(r.commitCount, 2);
  assert.deepEqual(r.commits.map((c) => c.subject), ['Ajoute le metier de serveur', 'Corrige le chargement']);
  assert.equal(r.commits[0].body, 'Details du metier.');
  assert.equal(r.filesChanged, 2);
  assert.equal(r.added, 1);
  assert.ok(r.areas['Gameplay / Jobs'] >= 1 && r.areas['Code / Core'] === 1);
  assert.equal(r.uncommitted, 1);

  const sansRepere = collect({ source: dir, releaseNotes: 'pas de repere' });
  assert.match(sansRepere.error, /point de depart/);
  assert.equal(collect({ source: dir, base }).commitCount, 2);
  rmSync(dir, { recursive: true, force: true });
});
