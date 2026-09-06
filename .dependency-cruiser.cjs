/** Architecture boundaries from BUILD_PLAN.md §5, enforced on the real import graph.
 * ESLint only sees one file at a time, so it cannot express "reachable through any chain"
 * or "no other sim". Those are the two rules that actually decay as sims are added.
 *
 * Run: npm run arch
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'core-is-framework-free',
      comment:
        'core/ is the framework-agnostic numerical layer. It must not reach React, the shell, '
        + 'the UI kit, the registry or any simulation — directly or through any chain of imports.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: {
        path:
          '^(src/(app|ui|sims|registry)/'
          + '|node_modules/(react|react-dom|react-router|react-router-dom|react-aria-components|katex)(/|$))',
        reachable: true,
      },
    },
    {
      name: 'sims-are-islands',
      comment:
        'A simulation may never import another simulation, at any depth. Shared code belongs in '
        + 'core/ or ui/. This is what keeps one lazy chunk per sim honest.',
      severity: 'error',
      from: { path: '^src/sims/([^/]+)/' },
      to: { path: '^src/sims/([^/]+)/', pathNot: '^src/sims/$1/' },
    },
    {
      name: 'only-the-registry-knows-sims',
      comment:
        'registry/sims.ts is the single manifest of which simulations exist. Anything else '
        + 'importing a sim directly defeats the lazy route chunking.',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/(registry|sims)/' },
      to: { path: '^src/sims/' },
    },
    {
      name: 'sims-depend-only-on-core-and-ui',
      comment:
        'A simulation may only reach down into core/ and ui/. Importing the registry would hand it '
        + 'a transitive route to every other sim, and importing the shell would couple it to routing.',
      severity: 'error',
      from: { path: '^src/sims/' },
      to: { path: '^src/(app|registry)/' },
    },
    {
      name: 'ui-is-reusable',
      comment:
        'ui/ holds accessible presentation primitives. Depending on the shell, the registry or a '
        + 'simulation would make them un-reusable by the next sim.',
      severity: 'error',
      from: { path: '^src/ui/' },
      to: { path: '^src/(app|registry|sims)/' },
    },
    {
      name: 'app-never-depends-on-the-test-harness',
      comment:
        'harness/ is the Phase 1 acceptance fixture. It may reach into sims/ — that is its whole '
        + 'purpose, and it sits outside src/ so `only-the-registry-knows-sims` still holds for the '
        + 'app — but nothing shipped may depend on it.',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^harness/' },
    },
    {
      name: 'no-circular',
      comment: 'A cycle means the layering above is already broken somewhere.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-dev-dependencies-in-shipped-code',
      comment: 'Shipped modules must not pull a devDependency into the client bundle.',
      severity: 'error',
      from: { path: '^src/', pathNot: '\\.test\\.tsx?$' },
      to: { dependencyTypes: ['npm-dev'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    // Type-only imports are real architectural edges; without this they are invisible.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
  },
};
