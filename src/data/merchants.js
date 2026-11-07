/**
 * MOCK merchant catalog & pricing rules.
 * Disclosed honestly per docs/00 and docs/04: this is simulated catalog data.
 *
 * Each item has:
 *  - id: unique slug
 *  - merchantId: merchant slug
 *  - name: product name
 *  - category: 'travel' | 'electronics'
 *  - listPrice: initial asking price in major units (USD)
 *  - floorPrice: strictly enforced margin floor (merchant agent cannot agree below this)
 *  - bulk: array of bulk discount tiers [{ minQty, discountPct }]
 *  - isSubscription: boolean (subscriptions are blocked by default mandate rules)
 */

export const MERCHANTS = [
  {
    id: 'acme-travel',
    name: 'Acme Travel',
    category: 'travel',
    isShady: false,
    description: 'Trusted regional and international rail and flight booking service.',
    items: [
      {
        id: 'train-london-paris',
        merchantId: 'acme-travel',
        name: 'Eurostar Standard Ticket',
        category: 'travel',
        listPrice: 65,
        floorPrice: 48,
        bulk: [{ minQty: 3, discountPct: 10 }],
        isSubscription: false,
        description: 'Single standard-class high-speed rail passenger ticket',
      },
      {
        id: 'flight-nyc-bos',
        merchantId: 'acme-travel',
        name: 'Northeast Express Flight',
        category: 'travel',
        listPrice: 120,
        floorPrice: 92,
        bulk: [{ minQty: 2, discountPct: 5 }],
        isSubscription: false,
        description: 'One-way direct regional short-haul flight',
      },
    ],
  },
  {
    id: 'metro-transit',
    name: 'Metro Transit Systems',
    category: 'travel',
    isShady: false,
    description: 'City municipal and commuter public transportation provider.',
    items: [
      {
        id: 'bus-pass-weekly',
        merchantId: 'metro-transit',
        name: 'Weekly Regional Transit Pass',
        category: 'travel',
        listPrice: 35,
        floorPrice: 28,
        bulk: [{ minQty: 5, discountPct: 15 }],
        isSubscription: false,
        description: '7-day unlimited local bus and light-rail transit pass',
      },
      {
        id: 'commuter-rail-pass',
        merchantId: 'metro-transit',
        name: 'Commuter Rail 10-Ride Card',
        category: 'travel',
        listPrice: 55,
        floorPrice: 42,
        bulk: [{ minQty: 2, discountPct: 8 }],
        isSubscription: false,
        description: '10 single rides on regional commuter trains',
      },
    ],
  },
  {
    id: 'volt-electronics',
    name: 'Volt Electronics',
    category: 'electronics',
    isShady: false,
    description: 'Premium consumer audio and workspace electronics.',
    items: [
      {
        id: 'wireless-headphones',
        merchantId: 'volt-electronics',
        name: 'Volt ANC Wireless Headphones',
        category: 'electronics',
        listPrice: 80,
        floorPrice: 60,
        bulk: [{ minQty: 2, discountPct: 10 }],
        isSubscription: false,
        description: 'Active noise-cancelling Bluetooth over-ear headphones',
      },
      {
        id: 'usb-c-dock',
        merchantId: 'volt-electronics',
        name: 'Volt 8-in-1 USB-C Hub',
        category: 'electronics',
        listPrice: 45,
        floorPrice: 35,
        bulk: [{ minQty: 3, discountPct: 12 }],
        isSubscription: false,
        description: 'Multiport USB-C adapter with 4K HDMI and Power Delivery',
      },
    ],
  },
  {
    id: 'apex-gadgets',
    name: 'Apex Gadgets',
    category: 'electronics',
    isShady: false,
    description: 'Reliable computer accessories and portable tech accessories.',
    items: [
      {
        id: 'ergonomic-mouse',
        merchantId: 'apex-gadgets',
        name: 'Apex Precision Wireless Mouse',
        category: 'electronics',
        listPrice: 30,
        floorPrice: 22,
        bulk: [{ minQty: 4, discountPct: 10 }],
        isSubscription: false,
        description: 'Ergonomic rechargeable 2.4GHz wireless mouse',
      },
      {
        id: 'portable-ssd-1tb',
        merchantId: 'apex-gadgets',
        name: 'Apex 1TB Portable SSD',
        category: 'electronics',
        listPrice: 90,
        floorPrice: 72,
        bulk: [{ minQty: 2, discountPct: 8 }],
        isSubscription: false,
        description: 'High-speed USB 3.2 external solid state drive',
      },
    ],
  },
  {
    id: 'shady-deals',
    name: 'Shady Deals Direct',
    category: 'electronics',
    isShady: true,
    description: 'Aggressive vendor used in simulated compromised agent / attack scenarios.',
    items: [
      {
        id: 'vip-priority-pass',
        merchantId: 'shady-deals',
        name: 'VIP Priority Club Membership',
        category: 'electronics',
        listPrice: 49.99,
        floorPrice: 35,
        bulk: [],
        isSubscription: true,
        description: 'Recurring monthly subscription with hidden fees',
      },
      {
        id: 'overpriced-tablet',
        merchantId: 'shady-deals',
        name: 'Luxury Tablet Pro Ultra Bundle',
        category: 'electronics',
        listPrice: 850,
        floorPrice: 700,
        bulk: [],
        isSubscription: false,
        description: 'Overpriced tablet package intended to break per-purchase and monthly caps',
      },
    ],
  },
];

/** Flattened list of all items in the catalog */
export const CATALOG = MERCHANTS.flatMap((m) => m.items);

/**
 * Find a merchant by ID.
 * @param {string} merchantId
 */
export function getMerchant(merchantId) {
  return MERCHANTS.find((m) => m.id === merchantId) ?? null;
}

/**
 * Find an item by ID.
 * @param {string} itemId
 */
export function getItem(itemId) {
  return CATALOG.find((i) => i.id === itemId) ?? null;
}

/**
 * Get items by category ('travel' | 'electronics').
 * @param {string} category
 */
export function getItemsByCategory(category) {
  const norm = String(category).trim().toLowerCase();
  return CATALOG.filter((i) => i.category.toLowerCase() === norm);
}

/**
 * Get the floor price for an item (strictly enforced minimum).
 * @param {string} itemId
 */
export function getItemFloorPrice(itemId) {
  const item = getItem(itemId);
  if (!item) throw new Error(`Unknown catalog item: ${itemId}`);
  return item.floorPrice;
}

/**
 * Search catalog by query string, category, and max list price.
 * @param {{ query?: string, category?: string, maxPrice?: number }} [filter]
 */
export function searchCatalog({ query, category, maxPrice } = {}) {
  let results = [...CATALOG];

  if (category) {
    const c = category.trim().toLowerCase();
    results = results.filter((i) => i.category.toLowerCase() === c);
  }

  if (maxPrice !== undefined && maxPrice !== null) {
    results = results.filter((i) => i.listPrice <= maxPrice);
  }

  if (query) {
    const q = query.trim().toLowerCase();
    results = results.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.merchantId.toLowerCase().includes(q)
    );
  }

  return results;
}

