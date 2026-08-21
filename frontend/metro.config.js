const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const { resolver } = config;

// Ensure wav audio files and asset extensions are properly resolved during production builds
config.resolver.assetExts = Array.from(
  new Set([...resolver.assetExts, 'wav', 'mp3', 'png', 'jpg', 'jpeg', 'svg'])
);

module.exports = config;
