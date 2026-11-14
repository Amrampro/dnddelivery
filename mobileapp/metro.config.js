const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const config = getDefaultConfig(__dirname);
// Pure TypeScript metadata shared with the Web; no React or DOM dependency.
config.watchFolders = [path.resolve(__dirname, "../shared")];
module.exports = config;
