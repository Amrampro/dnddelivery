// Passenger loads CommonJS; the application itself uses ES modules.
const process = require('node:process');
const console = require('node:console');
import('./dist/server.js').catch(() => {
  console.error('DND Delivery failed to start. Check the private application logs.');
  process.exit(1);
});
