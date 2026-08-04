import { useEffect, useState } from 'react';

/**
 * Increment A: prove the pipeline, nothing more.
 *
 * The page fetches /config.json — a file written at DEPLOY time by the CDK
 * stack, not baked into this build. Right now it only carries the environment
 * name, but it establishes the mechanism Increment B depends on: values that
 * do not exist until the infrastructure is created (user pool IDs, API URLs)
 * reach the browser through this file, so one build artifact works in any
 * environment.
 *
 * Locally (`npm run dev`) there is no deployed config.json, so the fetch
 * fails and the page shows "local" — that distinction doubles as a visible
 * check of which copy of the app you are looking at.
 */

interface RuntimeConfig {
  environment: string;
  region: string;
}

export default function App() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/config.json', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<RuntimeConfig>) : null))
      .then((c) => {
        if (!cancelled && c) setConfig(c);
      })
      .catch(() => {
        /* local dev — no deployed config */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="shell">
      <h1>oddssea</h1>
      <p className="muted">
        Increment A — a static page, served over HTTPS, deployed by a pipeline.
      </p>
      <dl className="facts">
        <dt>Environment</dt>
        <dd>
          <code>{config?.environment ?? 'local'}</code>
        </dd>
        <dt>Served from</dt>
        <dd>
          <code>{window.location.origin}</code>
        </dd>
      </dl>
    </main>
  );
}
