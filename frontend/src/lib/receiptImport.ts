export interface ParsedReceipt {
    store?: string;
    date?: string;
    items: { name: string; price: number }[];
    tax: number;
    tip: number;
    skipped: number;
}

/** Prompt the user pastes into any chat model (along with a receipt photo/text). */
export const RECEIPT_PROMPT = `You are a receipt parser. I will give you a grocery receipt (photo, PDF or pasted text). Extract it into JSON that exactly matches this schema:

{
  "store": "Store name, or empty string if unknown",
  "date": "YYYY-MM-DD, or empty string if unknown",
  "items": [
    { "name": "Item description", "price": 3.49 }
  ],
  "tax": 0.00,
  "tip": 0.00
}

Rules:
- "items" has one entry per purchased line item. "price" is the final TOTAL charged for that line as a plain number (no currency symbol). If an item has quantity > 1 (e.g. 3 @ 1.50), use the line total (4.50) and mention the quantity in the name.
- If a discount, coupon or sale reduction applies to an item, subtract it from that item's price. Never output negative prices.
- Do NOT include subtotal, total, payment, change, loyalty or savings summary lines as items.
- "tax" is the total tax on the receipt (sum multiple tax lines). Use 0 if none. "tip" is 0 unless the receipt shows one.
- Use the receipt's own wording for names, lightly cleaned up (e.g. "ORG BNLS CHKN BRST" -> "Organic Boneless Chicken Breast").
- Check your work: the sum of item prices plus tax should equal the receipt total. If it does not, re-read the receipt and fix mistakes.
- Respond with ONLY the JSON object, no commentary and no markdown code fences.`;

export const EXAMPLE_RECEIPT_JSON = `{
  "store": "Corner Market",
  "date": "2026-10-05",
  "items": [
    { "name": "Organic Honeycrisp Apples", "price": 12.40 },
    { "name": "Oat Milk", "price": 7.50 },
    { "name": "Free Range Eggs", "price": 5.99 }
  ],
  "tax": 1.25,
  "tip": 0
}`;

const asMoney = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/[^0-9.-]/g, '')) : NaN;
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

export function parseReceiptJson(raw: string): ParsedReceipt {
    // Chat models often wrap JSON in ```json fences or add a sentence around it.
    let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    if (!text.startsWith('{') && !text.startsWith('[')) {
        const m = text.match(/[[{][\s\S]*[\]}]/);
        if (m) text = m[0];
    }

    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('That is not valid JSON. Paste the model\'s response exactly as it returned it.');
    }

    const list = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(list)) throw new Error('JSON must contain an "items" array.');

    const items: ParsedReceipt['items'] = [];
    let skipped = 0;
    for (const row of list) {
        const name = String(row?.name ?? row?.item ?? '').trim();
        const price = asMoney(row?.price ?? row?.cost);
        if (!name || price === null || price < 0) {
            skipped++;
            continue;
        }
        items.push({ name, price });
    }
    if (items.length === 0) throw new Error('No valid items found. Each item needs a "name" and a non-negative "price".');

    const tax = Math.max(0, (Array.isArray(data) ? null : asMoney(data.tax)) ?? 0);
    const tip = Math.max(0, (Array.isArray(data) ? null : asMoney(data.tip)) ?? 0);
    const date = !Array.isArray(data) && typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : undefined;
    const store = !Array.isArray(data) && typeof data.store === 'string' && data.store.trim() ? data.store.trim() : undefined;

    return { store, date, items, tax, tip, skipped };
}
