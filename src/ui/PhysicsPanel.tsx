import { Disclosure, DisclosurePanel, Button, Heading } from 'react-aria-components';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface Props {
  equation: string;
  assumptions: readonly string[];
  sources: readonly { title: string; url: string }[];
}

export function PhysicsPanel({ equation, assumptions, sources }: Props) {
  // KaTeX handles authored TeX only. No user HTML; trust stays disabled.
  const html = katex.renderToString(equation, { throwOnError: false, trust: false, displayMode: true, output: 'htmlAndMathml' });
  return <Disclosure defaultExpanded className="physics-panel">
    <Heading><Button slot="trigger">The physics <span aria-hidden="true">↕</span></Button></Heading>
    <DisclosurePanel>
      <div className="equation" dangerouslySetInnerHTML={{ __html: html }} />
      <h3>Assumptions & limits</h3>
      <ul>{assumptions.map(item => <li key={item}>{item}</li>)}</ul>
      <h3>Go to the source</h3>
      <ul>{sources.map(source => <li key={source.url}><a href={source.url}>{source.title}</a></li>)}</ul>
    </DisclosurePanel>
  </Disclosure>;
}
