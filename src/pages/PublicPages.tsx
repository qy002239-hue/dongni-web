import { Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { ROUTES } from '../lib/routes';
import { FOOTER_LINKS, PUBLIC_PAGES, type PageConfig, type PageKey } from './public-page-data';
import './public-pages.css';

function usePageSeo(page: PageConfig) {
  useEffect(() => {
    document.title = `${page.title}｜懂妳`;

    let descriptionTag = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!descriptionTag) {
      descriptionTag = document.createElement('meta');
      descriptionTag.name = 'description';
      document.head.appendChild(descriptionTag);
    }
    descriptionTag.content = page.description;
  }, [page.description, page.title]);
}

function PublicPageLayout({ pageKey }: { pageKey: PageKey }) {
  const page = PUBLIC_PAGES[pageKey];
  usePageSeo(page);

  return (
    <main className="dongni-public-page">
      <section className="dongni-public-shell">
        <div className="dongni-public-hero">
          <p className="dongni-public-eyebrow">{page.eyebrow}</p>
          <h1>{page.title}</h1>
          <p className="dongni-public-intro">{page.intro}</p>
        </div>

        <div className="dongni-public-stack">
          {page.sections.map((section) => (
            <article key={section.title} className="dongni-public-card">
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}

          <div className="dongni-public-actions">
            {page.ctas.map((cta) => (
              <Link key={cta.to} to={cta.to} className={cta.variant === 'secondary' ? 'dongni-public-link dongni-public-link-secondary' : 'dongni-public-link'}>
                {cta.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

export function PublicPage({ pageKey }: { pageKey: PageKey }) {
  return <PublicPageLayout pageKey={pageKey} />;
}

export function SiteFooter() {
  const location = useLocation();

  return (
    <footer className="dongni-site-footer" aria-label="Site footer">
      <div className="dongni-site-footer-inner">
        <Link to={ROUTES.chat} className={`dongni-site-footer-link ${location.pathname === ROUTES.chat ? 'dongni-site-footer-link-active' : ''}`}>
          聊天
        </Link>
        {FOOTER_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`dongni-site-footer-link ${location.pathname === link.to ? 'dongni-site-footer-link-active' : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </footer>
  );
}