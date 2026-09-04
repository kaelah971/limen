import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

export function LimenLogo() {
  return (
    <Link href="/" className="brand-link" aria-label="Limen home">
      <Image className="brand-mark" src="/limen-logo.svg" alt="" width={32} height={32} priority />
      <span>Limen</span>
    </Link>
  );
}

function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  return (
    <>
      <Link className="nav-link" href="/#how-it-works">
        How it works
      </Link>
      <Link className="nav-link" href="/setup">
        Setup
      </Link>
      <Link className="nav-link" href="/proof">
        Proof
      </Link>
      <a
        className="nav-link"
        href="https://github.com/kaelah971/limen"
        target="_blank"
        rel="noreferrer noopener"
      >
        GitHub
        {mobile ? <ArrowUpRight aria-hidden="true" /> : null}
      </a>
    </>
  );
}

export function LimenHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <LimenLogo />
        <nav className="desktop-nav" aria-label="Primary navigation">
          <NavigationLinks />
        </nav>
        <div className="header-actions">
          <Link className="button button-primary" href="/proof">
            Inspect proof
            <ArrowUpRight aria-hidden="true" />
          </Link>
          <details className="mobile-nav">
            <summary aria-label="Toggle navigation">
              <span className="menu-icon" aria-hidden="true" />
            </summary>
            <nav className="mobile-nav-panel" aria-label="Mobile navigation">
              <NavigationLinks mobile />
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function LimenFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-copy">
          <LimenLogo />
          <p>Release evidence gate. Let evidence set the threshold.</p>
        </div>
        <div className="footer-meta">
          <p>Controlled demo evidence</p>
          <Link href="/proof">Inspect proof</Link>
          <a href="https://github.com/kaelah971/limen" target="_blank" rel="noreferrer noopener">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

export function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="page-frame">{children}</div>;
}
