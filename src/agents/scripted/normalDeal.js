/**
 * Canned transcript for a normal, honest negotiation.
 * Target item: train-london-paris (Eurostar Standard Ticket, listPrice: $65, floorPrice: $48).
 */
export const normalDealTranscript = [
  {
    from: 'buyer',
    action: 'offer',
    source: 'scripted',
    unitPrice: 50,
    quantity: 1,
    text: 'Hello! I would like to book the Eurostar Standard Ticket. Would you take $50 for it?',
  },
  {
    from: 'merchant',
    action: 'counter',
    source: 'scripted',
    unitPrice: 58,
    quantity: 1,
    text: 'Hello! Our list price is $65. I can offer a special web rate of $58 today.',
  },
  {
    from: 'buyer',
    action: 'counter',
    source: 'scripted',
    unitPrice: 54,
    quantity: 1,
    text: 'Thanks! How about we meet in the middle at $54?',
  },
  {
    from: 'merchant',
    action: 'counter',
    source: 'scripted',
    unitPrice: 55,
    quantity: 1,
    text: 'I can do $55 as my best price. Deal?',
  },
  {
    from: 'buyer',
    action: 'accept',
    source: 'scripted',
    unitPrice: 55,
    quantity: 1,
    text: 'Sounds great! Accepted at $55.',
  },
];
