import type { Config } from './config.js';

export interface ReleaseInfo {
  version: string;
  tag: string;
  notes: string;
  publishedAt: string | null;
  manifestUrl: string;
  htmlUrl: string;
}
export interface LatestReleases {
  stable: ReleaseInfo | null;
  beta: ReleaseInfo | null;
}

interface GhRelease {
  tag_name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
  assets: { name: string; browser_download_url: string }[];
}

/**
 * Convention de release d'un jeu : un tag GitHub = une version (le "v" initial est retire), l'asset
 * `manifest.json` decrit les fichiers (voir tools/make-release.mjs). Une pre-release = canal beta.
 */
export class GithubReleases {
  private cache = new Map<string, { at: number; value: LatestReleases }>();

  constructor(private config: Config, private fetchImpl: typeof fetch = fetch) {}

  async latest(repo: string): Promise<LatestReleases | null> {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
    const hit = this.cache.get(repo);
    const ttl = this.config.GITHUB_CACHE_SECONDS * 1000;
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    try {
      const headers: Record<string, string> = {
        accept: 'application/vnd.github+json',
        'user-agent': 'taf-launcher-backend',
      };
      if (this.config.GITHUB_TOKEN) headers['authorization'] = `Bearer ${this.config.GITHUB_TOKEN}`;
      const res = await this.fetchImpl(`https://api.github.com/repos/${repo}/releases?per_page=20`, { headers });
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const releases = (await res.json()) as GhRelease[];
      const value = this.pick(releases);
      this.cache.set(repo, { at: Date.now(), value });
      return value;
    } catch {
      // En cas d'erreur (quota, reseau) on garde la derniere valeur connue, meme perimee.
      return hit?.value ?? null;
    }
  }

  private pick(releases: GhRelease[]): LatestReleases {
    const toInfo = (r: GhRelease): ReleaseInfo | null => {
      const manifest = r.assets.find((a) => a.name === 'manifest.json');
      if (!manifest) return null;
      return {
        version: r.tag_name.replace(/^v/, ''),
        tag: r.tag_name,
        notes: r.body ?? '',
        publishedAt: r.published_at,
        manifestUrl: manifest.browser_download_url,
        htmlUrl: r.html_url,
      };
    };
    const usable = releases.filter((r) => !r.draft);
    const stable = usable.filter((r) => !r.prerelease).map(toInfo).find(Boolean) ?? null;
    const beta = usable.filter((r) => r.prerelease).map(toInfo).find(Boolean) ?? null;
    return { stable, beta };
  }
}
