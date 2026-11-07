import { PurchaseSchema } from '../schemas.js';
import { getItem, getMerchant } from '../data/merchants.js';

/**
 * Builds a strict PurchaseSchema proposal from a catalog item and agreed negotiation numbers.
 *
 * CRITICAL INVARIANT:
 * Category, description (item name), and isSubscription are locked to the catalog data.
 * Agent conversational text is NEVER used to populate purchase fields, preventing prompt
 * injection from smuggling permissions or disguised subscription terms.
 *
 * @param {object} params
 * @param {object|string} params.item - Catalog item object or item ID
 * @param {object} [params.deal] - Deal object containing { unitPrice, quantity }
 * @param {number} [params.unitPrice] - Agreed unit price
 * @param {number} [params.quantity] - Agreed quantity
 * @returns {import('zod').infer<typeof PurchaseSchema>}
 */
export function buildPurchaseProposal({ item: itemOrId, deal, unitPrice, quantity }) {
  const item = typeof itemOrId === 'string' ? getItem(itemOrId) : itemOrId;
  if (!item) {
    throw new Error('proposalBuilder requires a valid catalog item or item ID');
  }

  const price = deal?.unitPrice ?? unitPrice;
  const qty = deal?.quantity ?? quantity ?? 1;

  if (typeof price !== 'number' || price <= 0 || !Number.isFinite(price)) {
    throw new Error(`Invalid unit price for purchase proposal: ${price}`);
  }
  if (!Number.isInteger(qty) || qty < 1) {
    throw new Error(`Invalid quantity for purchase proposal: ${qty}`);
  }

  const merchant = getMerchant(item.merchantId);
  const totalAmount = Number((price * qty).toFixed(2));

  const proposal = {
    merchantId: item.merchantId,
    merchantName: merchant?.name || item.merchantId,
    category: item.category, // FROM CATALOG ONLY
    amount: totalAmount,
    currency: 'USD',
    description: item.name, // FROM CATALOG ONLY
    isSubscription: Boolean(item.isSubscription), // FROM CATALOG ONLY
  };

  return PurchaseSchema.parse(proposal);
}

