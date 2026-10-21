import type { Metadata } from "next";
import { ClockScreen } from "./ClockScreen";

/**
 * The offline clock-in screen.
 *
 * Static on purpose: there is nothing on it the server has to work out, which
 * is what lets the service worker keep a copy and open it with no signal at
 * all. Everything it shows comes from the phone - the roster it saved the
 * last time it had bars, and the scans it is holding.
 *
 * Nothing here is private to a worker: the roster is read from the phone's own
 * storage, and sending a scan needs the session cookie like everything else.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Scan card - PCG Shift Care",
};

export default function ClockPage() {
  return <ClockScreen />;
}
