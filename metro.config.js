const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // website/ is a separate Docusaurus app with its own node_modules and
  // build cache; Metro has no reason to watch it and doing so races against
  // the site's own build tooling.
  resolver: {
    blockList: [/website\/.*/],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
