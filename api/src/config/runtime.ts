// Security-release floors verified against the Node.js 2026-10-21 advisory.
// Review this list when adopting a new Node.js release line.
export function assertSecureNode(version = process.versions.node) {
  const [major, minor, patch] = version.replace(/^v/, "").split(".").map(Number);
  const floors: Record<number, readonly [number, number]> = { 22: [23, 4], 24: [22, 1], 26: [12, 1] };
  const floor = floors[major!];
  if (!floor || !Number.isInteger(minor) || !Number.isInteger(patch) ||
    minor! < floor[0] || (minor === floor[0] && patch! < floor[1]))
    throw new Error(`Node.js ${version} non autoris� : utilisez 22.23.4+, 24.22.1+ ou 26.12.1+ dans leur branche majeure respective.`);
}
