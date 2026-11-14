// Passenger loads CommonJS; the application itself uses ES modules.
async function main() {
  const { default: process } = await import('node:process');
  try {
    await import('./dist/server.js');
  } catch {
    process.stderr.write('DND Delivery failed to start. Check the private application logs.\n');
    process.exit(1);
  }
}
main();
