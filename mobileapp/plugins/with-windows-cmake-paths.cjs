const { platform } = require("node:os");
const { withAppBuildGradle } = require("expo/config-plugins");

// CMake's default 250 leaves too little room to hash the gesture-handler object
// in this Windows workspace. 256 fits the hashed name below Ninja's 260 limit.
module.exports = function withWindowsCmakePaths(config) {
  if (platform() !== "win32") return config;
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") {
      throw new Error("The Windows CMake path configuration requires Expo's Groovy template.");
    }
    const flag = "-DCMAKE_OBJECT_PATH_MAX=256";
    const contents = mod.modResults.contents;
    if (contents.includes(flag)) return mod;
    if ((contents.match(/\bdefaultConfig\s*\{/g) ?? []).length !== 1) {
      throw new Error("Cannot locate a unique Android defaultConfig for CMake paths.");
    }
    mod.modResults.contents = contents.replace(
      /\bdefaultConfig\s*\{/,
      `defaultConfig {\n        externalNativeBuild { cmake { arguments "${flag}" } }`,
    );
    return mod;
  });
};
