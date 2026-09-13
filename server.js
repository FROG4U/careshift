// Custom Next.js server entry point for Plesk + Phusion Passenger.
// Passenger sets PORT; locally it falls back to 3100.
// Outbound connections from this server. It has no working IPv6, and Node
// races IPv6 and IPv4 giving each attempt only 250 ms - less than the round
// trip from Melbourne to servers in Europe. So every call to them timed out
// ("fetch failed ETIMEDOUT") while curl worked: road distances for mileage
// never came back, and speed-limit and holiday lookups failed the same way.
// Prefer IPv4 and allow a realistic connect time.
require("dns").setDefaultResultOrder("ipv4first");
require("net").setDefaultAutoSelectFamilyAttemptTimeout(2500);

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const port = process.env.PORT || 3100;

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, () => {
    console.log(`> CareShift ready on port ${port}`);
  });
});
