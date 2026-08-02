// Starter set of common NDIS support items used to seed a tenant's NDIS
// price list. These are representative national (non-remote) price LIMITS
// drawn from the NDIS Pricing Arrangements and Price Limits — they MUST be
// verified against the current official guide before billing, as prices
// change quarterly and vary by region. Providers can edit any value, and the
// full official spreadsheet can be imported later.

export type NdisSeedItem = {
  code: string;
  name: string;
  unit: string;
  price: number;
  category: string;
};

export const NDIS_PRICE_GUIDE_NAME = "NDIS Price Guide (starter)";

export const NDIS_SEED_ITEMS: NdisSeedItem[] = [
  // Assistance with Daily Life (Core)
  {
    code: "01_011_0107_1_1",
    name: "Assistance With Self-Care – Weekday Daytime",
    unit: "hour",
    price: 67.56,
    category: "Daily Life",
  },
  {
    code: "01_015_0107_1_1",
    name: "Assistance With Self-Care – Weekday Evening",
    unit: "hour",
    price: 74.44,
    category: "Daily Life",
  },
  {
    code: "01_002_0107_1_1",
    name: "Assistance With Self-Care – Saturday",
    unit: "hour",
    price: 95.07,
    category: "Daily Life",
  },
  {
    code: "01_004_0107_1_1",
    name: "Assistance With Self-Care – Sunday",
    unit: "hour",
    price: 122.59,
    category: "Daily Life",
  },
  {
    code: "01_005_0107_1_1",
    name: "Assistance With Self-Care – Public Holiday",
    unit: "hour",
    price: 150.1,
    category: "Daily Life",
  },
  {
    code: "01_013_0117_1_1",
    name: "Assistance With Self-Care – Night-Time Sleepover",
    unit: "each",
    price: 287.69,
    category: "Daily Life",
  },
  // Household tasks
  {
    code: "01_020_0120_1_1",
    name: "House Cleaning And Other Household Activities",
    unit: "hour",
    price: 54.3,
    category: "Household",
  },
  {
    code: "01_021_0120_1_1",
    name: "Yard Maintenance",
    unit: "hour",
    price: 54.3,
    category: "Household",
  },
  // Community participation
  {
    code: "04_104_0125_6_1",
    name: "Access Community, Social & Rec Activities – Weekday Daytime",
    unit: "hour",
    price: 67.56,
    category: "Community",
  },
  {
    code: "04_103_0125_6_1",
    name: "Access Community, Social & Rec Activities – Saturday",
    unit: "hour",
    price: 95.07,
    category: "Community",
  },
  // Support coordination / capacity building
  {
    code: "07_001_0106_8_3",
    name: "Support Coordination – Level 2 (Coordination of Supports)",
    unit: "hour",
    price: 100.14,
    category: "Capacity Building",
  },
  {
    code: "07_004_0132_8_3",
    name: "Support Coordination – Level 3 (Specialist)",
    unit: "hour",
    price: 190.54,
    category: "Capacity Building",
  },
  // Transport / travel
  {
    code: "PROV_TRAVEL_KM",
    name: "Provider Travel – Non-Labour (per km)",
    unit: "km",
    price: 0.99,
    category: "Travel",
  },
  {
    code: "02_051_0108_1_1",
    name: "Activity Based Transport",
    unit: "each",
    price: 0.99,
    category: "Travel",
  },
];
