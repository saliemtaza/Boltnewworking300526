import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================================
// CORE TYPES
// ============================================================

export interface Product {
  id: string;
  name: string;
  parent_id: string | null;
  description: string;
  price: number;
  sale_price: number | null;
  image_url: string;
  is_in_stock: boolean;
  is_low_stock: boolean;
  is_featured: boolean;
  variant_label: string;
  created_at: string;
  last_promoted_at: string;
  is_auto_discounted: boolean;
  supply_alert_state: 'normal' | 'alert_10' | 'alert_20' | 'confirmed_oos';
  days_unordered_counter: number;
}

export interface Category {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
}

export interface ProductCategory {
  product_id: string;
  category_id: string;
  display_order_within_category: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type PaymentTerms = 'COD' | 'EFT' | 'Kazang' | 'Approved Account';

export interface OrderLog {
  id: string;
  shop_name: string;
  phone: string;
  address: string;
  order_data: OrderLineItem[];
  total_amount: number;
  delivery_fee: number;
  status: OrderStatus;
  order_notes: string;
  timestamp: string;
  requested_delivery_date: string | null;
  coordinates_lat: number | null;
  coordinates_lng: number | null;
  assigned_vehicle_id: string | null;
  routing_sequence_index: number | null;
  is_supplement: boolean;
  parent_order_id: string | null;
  payment_terms: PaymentTerms;
}

export interface OrderLineItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export type OrderStatus = 'pending' | 'captured' | 'dispatched' | 'delivered' | 'cancelled';

export interface Vehicle {
  id: string;
  name: string;
  max_capacity_value: number;
  max_drop_cap: string;
  display_order: number;
}

export interface BroadcastQueue {
  id: string;
  type: 'back_in_stock' | 'new_arrival';
  product_details: Record<string, unknown>;
  is_sent: boolean;
  created_at: string;
}

export interface DeliveryResult {
  allowed: boolean;
  zone: string;
  distance: number;
  minOrder: number;
  deliveryFee: number;
  freeDelivery: boolean;
  reason: string;
}

// ============================================================
// CONSTANTS
// ============================================================

export const WHATSAPP = {
  OWNER: '27645585247',
  ADMIN: '27834136934',
  STOCK_CONTROLLER: '27840633921',
} as const;

export const WAREHOUSE = {
  ADDRESS: 'Towerhive Business Park, 3 Caxton Street, Industria, Johannesburg',
  LAT: -26.2295,
  LNG: 28.0689,
} as const;

export const FLEET: Vehicle[] = [
  { id: 'isuzu-nqr500', name: 'Isuzu NQR500 AMT', max_capacity_value: 70000, max_drop_cap: '12-15', display_order: 1 },
  { id: 'gwm-diesel', name: 'GWM 1-Ton Diesel Van', max_capacity_value: 30000, max_drop_cap: '8-10', display_order: 2 },
  { id: 'gwm-petrol', name: 'GWM 1-Ton Petrol Van', max_capacity_value: 25000, max_drop_cap: '8-10', display_order: 3 },
];

export const SUPPLEMENT_WINDOW_MS = 120 * 60 * 1000; // 120 minutes

// ============================================================
// LOCAL STORAGE KEYS
// ============================================================

export const LS = {
  SHOP_NAME: 'taza_shop_name',
  PHONE: 'taza_phone',
  ADDRESS: 'taza_address',
  ORDER_ID: 'taza_last_order_id',
  ORDER_SHOP: 'taza_last_order_shop',
  ORDER_TIME: 'taza_last_order_time',
  FAVORITES: 'taza_favorites',
} as const;

export function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export function lsRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function getSupplementAnchor(): { orderId: string; shopName: string } | null {
  const orderId = lsGet(LS.ORDER_ID);
  const shopName = lsGet(LS.ORDER_SHOP);
  const orderTime = lsGet(LS.ORDER_TIME);
  if (!orderId || !shopName || !orderTime) return null;
  const elapsed = Date.now() - parseInt(orderTime, 10);
  if (elapsed > SUPPLEMENT_WINDOW_MS) {
    lsRemove(LS.ORDER_ID);
    lsRemove(LS.ORDER_SHOP);
    lsRemove(LS.ORDER_TIME);
    return null;
  }
  return { orderId, shopName };
}

export function setSupplementAnchor(orderId: string, shopName: string): void {
  lsSet(LS.ORDER_ID, orderId);
  lsSet(LS.ORDER_SHOP, shopName);
  lsSet(LS.ORDER_TIME, Date.now().toString());
}

export function getFavorites(): string[] {
  try {
    const raw = lsGet(LS.FAVORITES);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function toggleFavorite(productId: string): string[] {
  const favs = getFavorites();
  const next = favs.includes(productId)
    ? favs.filter((id) => id !== productId)
    : [...favs, productId];
  lsSet(LS.FAVORITES, JSON.stringify(next));
  return next;
}

// ============================================================
// DELIVERY ENGINE (Client-side calculation)
// ============================================================

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateDelivery(distanceKm: number, orderTotal: number): DeliveryResult {
  if (distanceKm > 60) {
    return { allowed: false, zone: 'beyond', distance: distanceKm, minOrder: Infinity, deliveryFee: 0, freeDelivery: false, reason: 'Delivery not available beyond 60km' };
  }
  if (orderTotal >= 5000 && distanceKm <= 60) {
    return { allowed: true, zone: distanceKm <= 35 ? 'zone1' : distanceKm <= 55 ? 'zone2' : 'zone3', distance: distanceKm, minOrder: 0, deliveryFee: 0, freeDelivery: true, reason: `High-value order - Free delivery up to 60km` };
  }
  if (distanceKm <= 35) {
    const meetsMin = orderTotal >= 1800;
    return { allowed: meetsMin, zone: 'zone1', distance: distanceKm, minOrder: 1800, deliveryFee: 0, freeDelivery: false, reason: meetsMin ? 'Zone 1 minimum met' : `Zone 1 minimum: R1,800` };
  }
  if (distanceKm <= 55) {
    const meetsMin = orderTotal >= 2000;
    return { allowed: meetsMin, zone: 'zone2', distance: distanceKm, minOrder: 2000, deliveryFee: 0, freeDelivery: false, reason: meetsMin ? 'Zone 2 minimum met' : `Zone 2 minimum: R2,000` };
  }
  if (distanceKm <= 60) {
    const meetsMin = orderTotal >= 2000;
    const blocks = Math.ceil((distanceKm - 55) / 5);
    const fee = blocks * 50;
    return { allowed: meetsMin, zone: 'zone3', distance: distanceKm, minOrder: 2000, deliveryFee: fee, freeDelivery: false, reason: meetsMin ? `Zone 3 - R${fee} delivery fee` : `Zone 3 minimum: R2,000 + R${fee} delivery` };
  }
  return { allowed: false, zone: 'beyond', distance: distanceKm, minOrder: Infinity, deliveryFee: 0, freeDelivery: false, reason: 'Beyond delivery range' };
}

// ============================================================
// DATE UTILITIES
// ============================================================

export function getDeliveryDateOptions(): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];
  const today = new Date();
  let count = 0;
  let day = 1;
  while (count < 7) {
    const d = new Date(today);
    d.setDate(d.getDate() + day);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const label = day === 1 ? 'Tomorrow' : `${d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}`;
      options.push({ label, value: `${yyyy}-${mm}-${dd}` });
      count++;
    }
    day++;
  }
  return options;
}

// ============================================================
// FORMAT HELPERS
// ============================================================

export function formatR(val: number): string {
  return `R${val.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format a single order line in the exact dispatch format:
// "• [Qty] x [Product Name] [Variant] @ R[Price] ea -> R[Total]"
export function formatOrderLine(item: OrderLineItem): string {
  const name = item.name;
  const unit = formatR(item.unitPrice);
  const total = formatR(item.lineTotal);
  return `${item.quantity} x ${name} @ ${unit} ea -> ${total}`;
}
