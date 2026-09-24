import { useState } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Lightbox from '@site/src/components/Lightbox';

import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  const logoUrl = useBaseUrl('img/logo.svg');
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <img src={logoUrl} alt="RommStream" className={styles.heroLogo} />
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/intro"
          >
            Get Started
          </Link>
          <Link
            className={clsx(
              'button button--outline button--lg',
              styles.githubButton,
            )}
            to="https://github.com/tacocats/RomMStream"
          >
            View on GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}

function Screenshots() {
  const screenshot1 = useBaseUrl('img/screenshots/screenshot1.png');
  const screenshot3 = useBaseUrl('img/screenshots/screenshot3.png');
  const screenshot4 = useBaseUrl('img/screenshots/screenshot4.png');
  const screenshot2 = useBaseUrl('img/screenshots/sceenshot2.png');
  const screenshots = [
    { src: screenshot1, alt: 'Home screen with library stats and shelves' },
    {
      src: screenshot4,
      alt: 'Platforms grid with console icons and game counts',
    },
    { src: screenshot3, alt: 'Search screen with platform filter chips' },
    {
      src: screenshot2,
      alt: 'Game details screen with cover art and Play button',
    },
  ];
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <section className={styles.screenshots}>
      <div className="container">
        <Heading as="h2" className="text--center">
          Your library, on the big screen
        </Heading>
        <div className="row">
          {screenshots.map(({ src, alt }, i) => (
            <div key={src} className="col col--3">
              <button
                type="button"
                className={styles.screenshotButton}
                onClick={() => setOpenIndex(i)}
                aria-label={`Expand screenshot: ${alt}`}
              >
                <img src={src} alt={alt} className={styles.screenshot} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <Lightbox
        images={screenshots}
        index={openIndex}
        onClose={() => setOpenIndex(null)}
        onNavigate={setOpenIndex}
      />
    </section>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <Screenshots />
      </main>
    </Layout>
  );
}
