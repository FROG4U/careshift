import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function daysFromNow(d: number) {
  const date = new Date();
  date.setDate(date.getDate() + d);
  return date;
}

function at(dayOffset: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function main() {
  // Wipe (dev only) so re-seeding is idempotent.
  await prisma.shift.deleteMany();
  await prisma.user.deleteMany();
  await prisma.client.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.tenant.deleteMany();

  // --- Tenant #1 (your company) ---
  const tenant = await prisma.tenant.create({
    data: {
      name: "CareShift Demo Care",
      slug: "demo",
      brandColor: "#0F766E",
    },
  });

  const adminPass = await bcrypt.hash("password123", 10);

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "admin@careshift.test",
      passwordHash: adminPass,
      name: "Alex Admin",
      role: "ADMIN",
    },
  });

  // --- Staff ---
  const staffData = [
    {
      firstName: "Bianca",
      lastName: "Nguyen",
      title: "Support Worker",
      phone: "0400 111 222",
      clearanceType: "NDIS Worker Screening",
      clearanceExpiry: daysFromNow(180),
    },
    {
      firstName: "Carlos",
      lastName: "Mendez",
      title: "Registered Nurse",
      phone: "0400 333 444",
      clearanceType: "NDIS Worker Screening",
      clearanceExpiry: daysFromNow(20), // expiring soon -> compliance alert
    },
    {
      firstName: "Dana",
      lastName: "Okoye",
      title: "Support Worker",
      phone: "0400 555 666",
      clearanceType: "WWCC",
      clearanceExpiry: daysFromNow(400),
    },
  ];
  const staff = [];
  for (const s of staffData) {
    staff.push(
      await prisma.staff.create({ data: { ...s, tenantId: tenant.id } }),
    );
  }

  // Give Bianca a worker login.
  const workerPass = await bcrypt.hash("password123", 10);
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "bianca@careshift.test",
      passwordHash: workerPass,
      name: "Bianca Nguyen",
      role: "WORKER",
      staffId: staff[0].id,
    },
  });

  // --- Clients (NDIS participants) ---
  const clientData = [
    {
      firstName: "Margaret",
      lastName: "Hayes",
      ndisNumber: "430000001",
      planStart: daysFromNow(-60),
      planEnd: daysFromNow(305),
      budget: 48000,
      address: "12 Rose St, Perth WA 6000",
      phone: "0411 000 111",
    },
    {
      firstName: "James",
      lastName: "Patel",
      ndisNumber: "430000002",
      planStart: daysFromNow(-120),
      planEnd: daysFromNow(245),
      budget: 72000,
      address: "5 Oak Ave, Perth WA 6004",
      phone: "0411 222 333",
    },
    {
      firstName: "Sophie",
      lastName: "Lim",
      ndisNumber: "430000003",
      planStart: daysFromNow(-15),
      planEnd: daysFromNow(350),
      budget: 30000,
      address: "88 River Rd, Perth WA 6009",
      phone: "0411 444 555",
    },
  ];
  const clients = [];
  for (const c of clientData) {
    clients.push(
      await prisma.client.create({ data: { ...c, tenantId: tenant.id } }),
    );
  }

  // --- Shifts (a few scheduled across this week) ---
  await prisma.shift.createMany({
    data: [
      {
        tenantId: tenant.id,
        clientId: clients[0].id,
        staffId: staff[0].id,
        start: at(0, 9),
        end: at(0, 12),
        address: clients[0].address,
        status: "SCHEDULED",
      },
      {
        tenantId: tenant.id,
        clientId: clients[1].id,
        staffId: staff[1].id,
        start: at(0, 13),
        end: at(0, 16),
        address: clients[1].address,
        status: "SCHEDULED",
      },
      {
        tenantId: tenant.id,
        clientId: clients[2].id,
        staffId: staff[2].id,
        start: at(1, 10),
        end: at(1, 14),
        address: clients[2].address,
        status: "SCHEDULED",
      },
      {
        tenantId: tenant.id,
        clientId: clients[0].id,
        staffId: staff[0].id,
        start: at(2, 9),
        end: at(2, 11),
        address: clients[0].address,
        status: "SCHEDULED",
      },
    ],
  });

  console.log("Seeded tenant:", tenant.name);
  console.log("Admin login:  admin@careshift.test / password123");
  console.log("Worker login: bianca@careshift.test / password123");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
