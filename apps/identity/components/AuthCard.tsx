import type { ReactNode } from "react";

const paths = {
  lock: <><rect x="5" y="10" width="14" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2" /></>,
  key: <><circle cx="8" cy="9" r="4" /><path d="m11 12 7 7h3v-3l-2-2-2 2m-2-4-2 2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
  shield: <><path d="M12 22s7-3 7-9V5l-7-3-7 3v8c0 6 7 9 7 9Z" /><path d="m9 12 2 2 4-4" /></>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  back: <path d="M20 12H5m6-6-6 6 6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" /></>,
  exit: <><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m-1-8h11m-4-4 4 4-4 4" /></>,
};

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

export function AuthCard({
  title,
  description,
  icon = "lock",
  children,
  footer,
  busy,
}: {
  title: string;
  description: ReactNode;
  icon?: keyof typeof paths;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
}) {
  return (
    <main className="auth-shell">
      <div className="auth-stack">
        <section className="auth-card" aria-labelledby="auth-heading" aria-busy={busy}>
          <header className="card-header">
            <div className="heading-icon"><Icon name={icon} /></div>
            <span className="product-name">mini system Identity</span>
            <h1 id="auth-heading">{title}</h1>
            <p>{description}</p>
          </header>
          <div className="card-body">{children}</div>
          {footer && <footer className="card-footer">{footer}</footer>}
        </section>
      </div>
    </main>
  );
}
