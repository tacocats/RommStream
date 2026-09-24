import type { ReactNode } from 'react';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Browse your library',
    description: (
      <>
        Recently added and recommended shelves, a platform grid with game
        counts, and search with platform filters.
      </>
    ),
  },
  {
    title: 'One-button play',
    description: (
      <>
        RommStream automatically picks the right player for each ROM, from
        in-browser emulators to full emulator streaming, powered by your RomM
        server.
      </>
    ),
  },
  {
    title: 'Your server, your library',
    description: (
      <>
        RommStream signs in to your own self-hosted{' '}
        <a href="https://github.com/rommapp/romm">Romm</a> server — no external
        accounts, no cloud dependency.
      </>
    ),
  },
];

function Feature({ title, description }: FeatureItem) {
  return (
    <div className="col col--4">
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
