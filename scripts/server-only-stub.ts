// Next.js resolves the "server-only" import through its bundler, so it does
// not exist as a real package on disk. Standalone scripts (tz-check) alias it
// here so they can import server modules like lib/payroll directly.
export {};
