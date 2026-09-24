module.exports = {
  root: true,
  extends: '@react-native',
  // ESLint ignores dotfiles by default and warns when asked to lint one,
  // which the pre-commit hook (--max-warnings=0) treats as a failure.
  // `website` is a separate Docusaurus project with its own tooling.
  ignorePatterns: ['!.detoxrc.js', 'website/'],
};
