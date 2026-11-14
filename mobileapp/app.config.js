/* global module, process, URL */

function checkPublicUrl(key, pathname) {
  const value = process.env[key];
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Error(`${key} doit contenir une URL HTTPS publique.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search ||
      url.hash || (pathname && url.pathname !== pathname) ||
      url.hostname === "localhost" || url.hostname.endsWith(".localhost") ||
      url.hostname === "[::1]" || url.hostname.startsWith("127.") ||
      url.hostname === "0.0.0.0")
    throw Error(`${key} doit contenir une URL HTTPS publique${pathname ? " terminée par " + pathname : ""}.`);
}

module.exports = ({ config }) => {
  if (["preview", "production"].includes(process.env.EAS_BUILD_PROFILE)) {
    checkPublicUrl("EXPO_PUBLIC_API_URL", "/api");
    checkPublicUrl("EXPO_PUBLIC_WEB_APP_URL");
  }
  return config;
};

