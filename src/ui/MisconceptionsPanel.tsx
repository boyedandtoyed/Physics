import { Disclosure, DisclosurePanel, Button, Heading } from 'react-aria-components';

export interface Misconception {
  /** The claim as people actually meet it. Shown, not hidden — users arrive believing it. */
  myth: string;
  /** What is actually true. */
  reality: string;
  /** The number that settles it. PHYSICS_SPEC §7.5: label the myth *and show the calculation*. */
  figures?: { label: string; value: string }[];
  source?: { title: string; url: string };
}

/** Required feature, not a nice-to-have (PHYSICS_SPEC §7.5, CLAUDE.md). Where a popular framing
 * is wrong we show it, label it, and give the number that breaks it. */
export function MisconceptionsPanel({ items }: { items: readonly Misconception[] }) {
  return (
    <Disclosure className="misconceptions" defaultExpanded>
      <Heading level={2}><Button slot="trigger">Common misconceptions <span aria-hidden="true">↕</span></Button></Heading>
      <DisclosurePanel>
        <ul>
          {items.map(item => (
            <li key={item.myth}>
              <p className="myth"><span className="myth-tag">Myth</span> {item.myth}</p>
              <p className="reality">{item.reality}</p>
              {item.figures?.length ? (
                <dl className="myth-figures">
                  {item.figures.map(figure => (
                    <div key={figure.label}>
                      <dt>{figure.label}</dt>
                      <dd>{figure.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {item.source ? <p><a href={item.source.url}>{item.source.title}</a></p> : null}
            </li>
          ))}
        </ul>
      </DisclosurePanel>
    </Disclosure>
  );
}
