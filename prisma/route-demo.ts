import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const HOME = process.argv[2] || "GL50 3PR";     // start / client home
const VISIT = process.argv[3] || "GL53 7AN";    // visit (e.g. hospital)

async function geocode(pc: string) {
  const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc.replace(/\s/g,""))}`);
  const j = await r.json();
  if (j.status !== 200) throw new Error(`Bad postcode: ${pc}`);
  return { lat: j.result.latitude, lng: j.result.longitude, pc: j.result.postcode };
}
async function route(a: {lat:number;lng:number}, b: {lat:number;lng:number}) {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  const j = await (await fetch(url)).json();
  const rt = j.routes[0];
  return { km: rt.distance / 1000, points: rt.geometry.coordinates.map((c: number[]) => ({ lat: c[1], lng: c[0] })) };
}

async function main() {
  const home = await geocode(HOME);
  const visit = await geocode(VISIT);
  const out = await route(home, visit);   // home -> visit
  const back = await route(visit, home);  // visit -> home
  console.log(`${home.pc} → ${visit.pc}: ${out.km.toFixed(1)} km (${out.points.length} pts), return ${back.km.toFixed(1)} km`);

  const shift = await prisma.shift.findFirst({ where: { status: "COMPLETED", staff: { firstName: "Danu" } }, orderBy: { start: "asc" } });
  if (!shift) return console.log("no demo shift");

  // Reset the demo shift's location + trips to this real routed journey.
  await prisma.transport.deleteMany({ where: { shiftId: shift.id } });
  await prisma.client.update({ where: { id: shift.clientId }, data: { lat: home.lat, lng: home.lng } });
  await prisma.shift.update({ where: { id: shift.id }, data: {
    clockInLat: home.lat, clockInLng: home.lng, clockOutLat: home.lat, clockOutLng: home.lng,
  }});
  await prisma.transport.create({ data: {
    shiftId: shift.id, purpose: `To ${visit.pc}`, km: Math.round(out.km*10)/10,
    startLat: home.lat, startLng: home.lng, endLat: visit.lat, endLng: visit.lng,
    points: { create: out.points.map((p: {lat:number;lng:number}) => ({ lat: p.lat, lng: p.lng })) },
  }});
  await prisma.transport.create({ data: {
    shiftId: shift.id, purpose: `Return to ${home.pc}`, km: Math.round(back.km*10)/10,
    startLat: visit.lat, startLng: visit.lng, endLat: home.lat, endLng: home.lng,
    points: { create: back.points.map((p: {lat:number;lng:number}) => ({ lat: p.lat, lng: p.lng })) },
  }});
  console.log(`Applied to shift ${shift.id} — open its "View" to see the routed map.`);
}
main().then(() => prisma.$disconnect()).catch(e => { console.error(e.message); prisma.$disconnect(); });
