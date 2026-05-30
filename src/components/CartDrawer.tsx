import { X, Minus, Plus, Trash2, MapPin, Truck, AlertCircle, ChevronDown, FileText, WifiOff } from 'lucide-react';
import {
  CartItem, DeliveryResult, formatR, lsGet, lsSet, LS, getSupplementAnchor, setSupplementAnchor,
  calculateDelivery, haversineDistance, WAREHOUSE, getDeliveryDateOptions, WHATSAPP,
  OrderLineItem, PaymentTerms, formatOrderLine
} from '../lib/supabase';
import { addToSyncQueue } from '../lib/offline';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

const PAYMENT_TERMS_OPTIONS: { value: PaymentTerms; label: string }[] = [
  { value: 'COD', label: 'COD (Cash)' },
  { value: 'EFT', label: 'EFT (Pre-Paid)' },
  { value: 'Kazang', label: 'Kazang' },
  { value: 'Approved Account', label: 'Approved Account' },
];

interface CartDrawerProps {
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onClose: () => void;
  isOpen: boolean;
  cartDisabled: boolean;
  totalPrice: number;
  totalSavings: number;
  online: boolean;
  onDeliveryZoneChange: (result: DeliveryResult | null) => void;
}

export function CartDrawer({ items, onUpdateQuantity, onRemoveItem, onClearCart, onClose, isOpen, cartDisabled, totalPrice, totalSavings, online, onDeliveryZoneChange }: CartDrawerProps) {
  const supplement = getSupplementAnchor();
  const isSupplementMode = !!supplement;

  const [shopName, setShopName] = useState(lsGet(LS.SHOP_NAME) || '');
  const [phone, setPhone] = useState(lsGet(LS.PHONE) || '');
  const [address, setAddress] = useState(lsGet(LS.ADDRESS) || '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryResult, setDeliveryResult] = useState<{ allowed: boolean; zone: string; distance: number; minOrder: number; deliveryFee: number; freeDelivery: boolean; reason: string } | null>(null);
  const [deliveryDate, setDeliveryDate] = useState(getDeliveryDateOptions()[0]?.value || '');
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('COD');
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout>>();

  // Persist form fields
  useEffect(() => {
    if (shopName) lsSet(LS.SHOP_NAME, shopName);
    if (phone) lsSet(LS.PHONE, phone);
    if (address) lsSet(LS.ADDRESS, address);
  }, [shopName, phone, address]);

  // Geocode address
  const geocodeAddress = useCallback(async (addr: string) => {
    if (!addr.trim()) { setCoords(null); setDeliveryResult(null); onDeliveryZoneChange(null); return; }
    setGeoLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr + ', Johannesburg, South Africa')}&limit=1`);
      const data = await res.json();
      if (data && data[0]) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setCoords({ lat, lng });
        const dist = haversineDistance(WAREHOUSE.LAT, WAREHOUSE.LNG, lat, lng);
        const result = calculateDelivery(dist, totalPrice);
        setDeliveryResult(result);
        onDeliveryZoneChange(result);
      } else {
        setCoords(null);
        setDeliveryResult(null);
        onDeliveryZoneChange(null);
      }
    } catch {
      setCoords(null);
      setDeliveryResult(null);
      onDeliveryZoneChange(null);
    }
    setGeoLoading(false);
  }, [totalPrice, onDeliveryZoneChange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (address.length > 5) geocodeAddress(address);
    }, 800);
    return () => clearTimeout(timer);
  }, [address, geocodeAddress]);

  const effectiveMinOrder = isSupplementMode ? 0 : (deliveryResult?.minOrder ?? 0);
  const effectiveDeliveryFee = deliveryResult?.deliveryFee ?? 0;
  const orderTotal = totalPrice + effectiveDeliveryFee;
  const canProceed = items.length > 0 && !cartDisabled;
  const canCheckout = canProceed && (isSupplementMode || totalPrice >= effectiveMinOrder) && (!deliveryResult || deliveryResult.allowed || isSupplementMode) && shopName.trim() && phone.trim() && address.trim();

  const handleClearCart = () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      clearTimer.current = setTimeout(() => setClearConfirm(false), 3000);
      return;
    }
    onClearCart();
    setClearConfirm(false);
  };

  useEffect(() => {
    return () => { if (clearTimer.current) clearTimeout(clearTimer.current); };
  }, []);

  // Build the exact-format WhatsApp message string
  const buildMessage = (orderId: string | null): string => {
    let message = '';
    if (isSupplementMode && supplement) {
      message += `ORDER SUPPLEMENT - TAZA DIRECT\n\n`;
      message += `ATTENTION ADMINISTRATOR: ATTACH TO ORIGINAL ORDER #${supplement.orderId.slice(0, 8).toUpperCase()}\n\n`;
    } else {
      message += `NEW ORDER - TAZA DIRECT\n\n`;
    }
    message += `Shop: ${shopName}\n`;
    message += `Phone: ${phone}\n`;
    message += `Address: ${address}\n`;
    message += `Payment: ${paymentTerms}\n`;
    message += `Delivery: ${deliveryDate}\n`;
    if (orderNotes) message += `Notes: ${orderNotes}\n`;
    message += `\n------------------\n`;

    const lineItems: OrderLineItem[] = items.map((item) => ({
      productId: item.product.id,
      name: item.product.name + (item.product.variant_label ? ` ${item.product.variant_label}` : ''),
      quantity: item.quantity,
      unitPrice: item.product.sale_price ?? item.product.price,
      lineTotal: (item.product.sale_price ?? item.product.price) * item.quantity,
    }));

    for (const item of lineItems) {
      message += `${formatOrderLine(item)}\n`;
    }
    message += `------------------\n`;
    message += `Subtotal: ${formatR(totalPrice)}\n`;
    if (totalSavings > 0) message += `Savings: ${formatR(totalSavings)}\n`;
    if (effectiveDeliveryFee > 0) message += `Delivery: ${formatR(effectiveDeliveryFee)}\n`;
    message += `\nTOTAL: ${formatR(orderTotal)}\n`;
    if (deliveryResult) {
      message += `Distance: ${deliveryResult.distance.toFixed(1)}km (${deliveryResult.zone})\n`;
    }
    if (orderId) {
      message += `Order ID: #${orderId.slice(0, 8).toUpperCase()}\n`;
    }
    message += `\nAll prices are inclusive of VAT where applicable.`;
    return message;
  };

  // Generate Proforma PDF
  const generateProformaPDF = (orderId: string) => {
    const lineItems: OrderLineItem[] = items.map((item) => ({
      productId: item.product.id,
      name: item.product.name + (item.product.variant_label ? ` ${item.product.variant_label}` : ''),
      quantity: item.quantity,
      unitPrice: item.product.sale_price ?? item.product.price,
      lineTotal: (item.product.sale_price ?? item.product.price) * item.quantity,
    }));

    let html = `<html><head><title>Taza Direct - Proforma Invoice</title><style>
      body { font-family: Arial, sans-serif; margin: 20px; color: #0F172A; font-size: 12px; }
      h1 { color: #0F172A; border-bottom: 3px solid #F59E0B; padding-bottom: 8px; font-size: 18px; }
      .header-row { display: flex; justify-content: space-between; margin-bottom: 16px; }
      .info-block { line-height: 1.6; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
      th { background: #0F172A; color: white; padding: 8px 6px; text-align: left; }
      td { padding: 7px 6px; border-bottom: 1px solid #E2E8F0; }
      .right { text-align: right; }
      .totals { margin-top: 12px; font-size: 12px; }
      .totals .line { display: flex; justify-content: space-between; padding: 3px 0; }
      .grand-total { font-size: 16px; font-weight: bold; color: #10B981; border-top: 2px solid #0F172A; padding-top: 6px; margin-top: 6px; }
      .footer { margin-top: 24px; font-size: 10px; color: #64748B; border-top: 1px solid #CBD5E1; padding-top: 8px; }
      .stamp { margin-top: 20px; border: 1px dashed #94A3B8; padding: 12px; text-align: center; color: #64748B; font-size: 10px; }
    </style></head><body>`;
    html += `<h1>PROFORMA INVOICE</h1>`;
    html += `<div class="header-row"><div class="info-block">
      <strong>Taza Direct</strong><br/>
      Towerhive Business Park, 3 Caxton St<br/>
      Industria, Johannesburg<br/>
      Tel: +27 64 558 5247
    </div><div class="info-block" style="text-align:right">
      <strong>Invoice #</strong> ${orderId.slice(0, 8).toUpperCase()}<br/>
      <strong>Date:</strong> ${new Date().toLocaleDateString('en-ZA')}<br/>
      <strong>Delivery:</strong> ${deliveryDate}<br/>
      <strong>Payment:</strong> ${paymentTerms}
    </div></div>`;
    html += `<div class="info-block" style="margin-bottom:12px"><strong>Bill To:</strong> ${shopName}<br/>${address}<br/>${phone}</div>`;
    html += `<table><tr><th>Qty</th><th>Description</th><th class="right">Unit Price</th><th class="right">Total</th></tr>`;
    for (const item of lineItems) {
      html += `<tr><td>${item.quantity}</td><td>${item.name}</td><td class="right">${formatR(item.unitPrice)}</td><td class="right">${formatR(item.lineTotal)}</td></tr>`;
    }
    html += `</table>`;
    html += `<div class="totals">`;
    html += `<div class="line"><span>Subtotal</span><span>${formatR(totalPrice)}</span></div>`;
    if (totalSavings > 0) html += `<div class="line" style="color:#10B981"><span>Savings</span><span>-${formatR(totalSavings)}</span></div>`;
    if (effectiveDeliveryFee > 0) html += `<div class="line"><span>Delivery Fee</span><span>${formatR(effectiveDeliveryFee)}</span></div>`;
    html += `<div class="grand-total line"><span>TOTAL</span><span>${formatR(orderTotal)}</span></div>`;
    html += `</div>`;
    html += `<div class="stamp">This is a proforma invoice. Payment confirms order.</div>`;
    html += `<div class="footer">All prices are inclusive of VAT where applicable. | Taza Direct - Towerhive Business Park, 3 Caxton Street, Industria, Johannesburg</div>`;
    html += `</body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Dual-channel WhatsApp dispatch
  const dispatchWhatsApp = (message: string) => {
    const primaryUrl = `https://wa.me/${WHATSAPP.OWNER}?text=${encodeURIComponent(message)}`;
    const secondaryUrl = `https://wa.me/${WHATSAPP.ADMIN}?text=${encodeURIComponent(message)}`;
    window.open(primaryUrl, '_blank');
    setTimeout(() => window.open(secondaryUrl, '_blank'), 600);
  };

  const handleSubmitOrder = async () => {
    if (!canCheckout || submitting) return;
    setSubmitting(true);

    const lineItems: OrderLineItem[] = items.map((item) => ({
      productId: item.product.id,
      name: item.product.name + (item.product.variant_label ? ` ${item.product.variant_label}` : ''),
      quantity: item.quantity,
      unitPrice: item.product.sale_price ?? item.product.price,
      lineTotal: (item.product.sale_price ?? item.product.price) * item.quantity,
    }));

    const orderPayload = {
      shop_name: shopName,
      phone,
      address,
      order_data: lineItems,
      total_amount: totalPrice,
      delivery_fee: effectiveDeliveryFee,
      status: 'pending' as const,
      order_notes: orderNotes,
      requested_delivery_date: deliveryDate,
      coordinates_lat: coords?.lat ?? null,
      coordinates_lng: coords?.lng ?? null,
      is_supplement: isSupplementMode,
      parent_order_id: supplement?.orderId ?? null,
      payment_terms: paymentTerms,
    };

    let orderId: string | null = null;

    if (online) {
      // Live insert
      try {
        const { data, error } = await supabase.from('orders_log').insert(orderPayload).select('id').maybeSingle();
        if (error) {
          console.error('Order insert error:', error);
        }
        if (data) {
          orderId = data.id;
          setSupplementAnchor(data.id, shopName);
        }
      } catch (err) {
        console.error('Order submit error:', err);
      }
    } else {
      // Offline: queue locally
      const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      orderId = tempId;
      setSupplementAnchor(tempId, shopName);
      await addToSyncQueue({
        type: 'order',
        payload: orderPayload,
        message: buildMessage(tempId),
        timestamp: Date.now(),
      });
    }

    // Build message and dispatch
    const message = buildMessage(orderId);
    dispatchWhatsApp(message);

    // Generate Proforma PDF
    if (orderId) {
      generateProformaPDF(orderId);
    }

    onClearCart();
    setShowCheckout(false);
    onClose();
    setSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md max-h-[92vh] rounded-t-2xl sm:rounded-2xl overflow-hidden animate-slide-up shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">
              {isSupplementMode ? 'Order Supplement' : 'Your Cart'}
            </h2>
            {!online && (
              <span className="flex items-center gap-1 text-amber-400 text-xs font-semibold">
                <WifiOff size={12} /> Offline
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X size={20} className="text-slate-300" />
          </button>
        </div>

        {cartDisabled ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400">
            <Truck size={32} className="mb-3" />
            <p className="font-medium">Orders temporarily disabled</p>
            <p className="text-sm mt-1">Please check back later</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400">
            <Truck size={32} className="mb-3 text-slate-300" />
            <p className="font-medium">Your cart is empty</p>
            <p className="text-sm mt-1">Add some products to get started</p>
          </div>
        ) : !showCheckout ? (
          <>
            {/* Cart Items View */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {items.map((item) => {
                const actualPrice = item.product.sale_price ?? item.product.price;
                const lineTotal = actualPrice * item.quantity;
                const regularLineTotal = item.product.price * item.quantity;
                const itemSavings = regularLineTotal - lineTotal;

                return (
                  <div key={item.product.id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 shadow-sm">
                    <img src={item.product.image_url} alt={item.product.name} className="w-14 h-14 rounded-lg object-cover" />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-slate-900 truncate">
                        {item.product.name}
                        {item.product.variant_label && <span className="text-slate-400 text-xs ml-1">({item.product.variant_label})</span>}
                      </h4>
                      <div className="flex flex-col gap-0.5">
                        {itemSavings > 0 ? (
                          <>
                            <p className="text-slate-400 text-xs line-through">{formatR(regularLineTotal)}</p>
                            <p className="text-emerald-500 font-bold text-sm">{formatR(lineTotal)}</p>
                          </>
                        ) : (
                          <p className="text-emerald-500 font-bold text-sm">{formatR(lineTotal)}</p>
                        )}
                      </div>
                    </div>
                    {/* Amber pill-shaped qty selector */}
                    <div className="flex items-center gap-1.5 bg-amber-50 rounded-full px-1.5 py-1">
                      <button
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                        className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center hover:bg-amber-50 transition-colors min-w-[44px] min-h-[44px]"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-6 text-center text-sm font-bold text-amber-800">{item.quantity}</span>
                      <button
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                        className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center hover:bg-amber-50 transition-colors min-w-[44px] min-h-[44px]"
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        onClick={() => onRemoveItem(item.product.id)}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors ml-1 min-w-[44px] min-h-[44px]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary + Proceed Button */}
            <div className="border-t border-slate-100 p-4 space-y-3">
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatR(totalPrice)}</span>
                </div>
                {totalSavings > 0 && (
                  <div className="flex items-center justify-between text-emerald-500 font-medium">
                    <span>Total Savings</span>
                    <span>-{formatR(totalSavings)}</span>
                  </div>
                )}
              </div>
              <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
                <span className="text-slate-900 font-semibold">Total</span>
                <span className="text-emerald-500 font-bold text-xl">{formatR(totalPrice)}</span>
              </div>

              <button
                onClick={() => setShowCheckout(true)}
                disabled={!canProceed}
                className={`w-full font-semibold py-3.5 rounded-full transition-all shadow-sm flex items-center justify-center gap-2 min-h-[44px] ${
                  canProceed
                    ? 'bg-amber-500 text-slate-900 hover:bg-amber-600 active:scale-[0.98]'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                Proceed to Checkout
              </button>

              <button
                onClick={handleClearCart}
                className={`w-full text-xs font-medium transition-colors py-2 min-h-[44px] ${
                  clearConfirm ? 'text-red-600 font-bold' : 'text-slate-400 hover:text-red-500'
                }`}
              >
                {clearConfirm ? 'Confirm Clear Cart?' : 'Clear Cart'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Checkout Drawer */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Back button */}
              <button
                onClick={() => setShowCheckout(false)}
                className="text-sm text-slate-500 hover:text-slate-700 transition-colors min-h-[44px] flex items-center"
              >
                Back to Cart
              </button>

              {/* Form Fields with LocalStorage Prefill */}
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Shop Name *"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 rounded-lg text-sm border border-slate-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition-all min-h-[44px]"
                />
                <input
                  type="tel"
                  placeholder="Phone Number *"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 rounded-lg text-sm border border-slate-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition-all min-h-[44px]"
                />
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Delivery Address *"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 bg-slate-50 rounded-lg text-sm border border-slate-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition-all min-h-[44px]"
                  />
                  {geoLoading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-500 animate-pulse">Locating...</span>}
                </div>

                {/* Payment Terms Dropdown */}
                <div className="relative">
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}
                    className="w-full px-3 py-2.5 bg-slate-50 rounded-lg text-sm border border-slate-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition-all min-h-[44px] appearance-none pr-8"
                  >
                    {PAYMENT_TERMS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>

                {/* Delivery Date Dropdown */}
                <div className="relative">
                  <select
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 rounded-lg text-sm border border-slate-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition-all min-h-[44px] appearance-none pr-8"
                  >
                    {getDeliveryDateOptions().map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>

                <input
                  type="text"
                  placeholder="Order Notes (optional)"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 rounded-lg text-sm border border-slate-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition-all min-h-[44px]"
                />
              </div>

              {/* Offline Notice */}
              {!online && (
                <div className="p-3 rounded-lg text-xs bg-amber-50 text-amber-700 flex items-center gap-2 border border-amber-200">
                  <WifiOff size={14} />
                  You are offline. Your order will be saved locally and synced when connection returns. WhatsApp will queue on your device.
                </div>
              )}

              {/* Delivery Result */}
              {deliveryResult && !isSupplementMode && (
                <div className={`p-3 rounded-lg text-xs ${deliveryResult.allowed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                  <div className="flex items-center gap-2">
                    <Truck size={14} />
                    <span className="font-semibold">{deliveryResult.distance.toFixed(1)}km - {deliveryResult.zone.toUpperCase()}</span>
                  </div>
                  <p className="mt-1">{deliveryResult.reason}</p>
                  {effectiveDeliveryFee > 0 && <p className="mt-1 font-semibold">Delivery Fee: {formatR(effectiveDeliveryFee)}</p>}
                </div>
              )}

              {!isSupplementMode && !deliveryResult && totalPrice < 1800 && (
                <div className="p-3 rounded-lg text-xs bg-amber-50 text-amber-700 flex items-center gap-2 border border-amber-200">
                  <AlertCircle size={14} />
                  Enter your address to calculate delivery zone and minimums
                </div>
              )}

              {/* Pricing Summary */}
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatR(totalPrice)}</span>
                </div>
                {totalSavings > 0 && (
                  <div className="flex items-center justify-between text-emerald-500 font-medium">
                    <span>Total Savings</span>
                    <span>-{formatR(totalSavings)}</span>
                  </div>
                )}
                {effectiveDeliveryFee > 0 && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Delivery Fee</span>
                    <span>{formatR(effectiveDeliveryFee)}</span>
                  </div>
                )}
                {!isSupplementMode && effectiveMinOrder > 0 && totalPrice < effectiveMinOrder && (
                  <div className="flex items-center justify-between text-amber-600 font-medium text-xs">
                    <span>Minimum for delivery</span>
                    <span>{formatR(effectiveMinOrder)}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
                <span className="text-slate-900 font-semibold">Total</span>
                <span className="text-emerald-500 font-bold text-xl">{formatR(orderTotal)}</span>
              </div>
            </div>

            {/* Submit Button */}
            <div className="border-t border-slate-100 p-4 space-y-2">
              <button
                onClick={handleSubmitOrder}
                disabled={!canCheckout || submitting}
                className={`w-full font-semibold py-3.5 rounded-full transition-all shadow-md flex items-center justify-center gap-2 min-h-[44px] ${
                  canCheckout && !submitting
                    ? 'bg-amber-500 text-slate-900 hover:bg-amber-600 active:scale-[0.98]'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {submitting ? 'Processing...' : (
                  <>
                    <FileText size={16} />
                    Confirm & Dispatch via WhatsApp
                  </>
                )}
              </button>

              {/* Order preview note */}
              <p className="text-center text-[10px] text-slate-400">
                {online
                  ? 'Order saved to database + Proforma PDF + dual WhatsApp dispatch'
                  : 'Order queued locally + Proforma PDF + WhatsApp queued on device'
                }
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
