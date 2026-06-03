// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle dotLottie (.lottie) files as assets so they can be require()'d and
// passed to lottie-react-native's <LottieView source={...} />.
config.resolver.assetExts.push('lottie');

module.exports = config;
