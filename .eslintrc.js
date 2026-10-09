module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // `void promise()` marks a deliberate fire-and-forget call, which
    // SonarCloud requires for promises that aren't awaited or caught.
    'no-void': ['warn', { allowAsStatement: true }],
  },
  // ESLint ignores dotfiles by default and warns when asked to lint one,
  // which the pre-commit hook (--max-warnings=0) treats as a failure.
  // `website` is a separate Docusaurus project with its own tooling;
  // dist/ and release/ are desktop build output; coverage/ is Jest's report.
  ignorePatterns: [
    '!.detoxrc.js',
    'website/',
    'dist/',
    'release/',
    'coverage/',
    'artifacts/',
  ],
};
