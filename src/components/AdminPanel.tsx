import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Save, Eye, EyeOff, Check, ChevronUp, ChevronDown, Trash2, Plus, Package, ClipboardList, Truck, BarChart3, Settings, AlertTriangle, Flame, Copy, FileText, RefreshCw, ToggleLeft, ToggleRight, MessageCircle, Star, Search, Upload, Image as ImageIcon, Tag, TrendingUp, TrendingDown, ShieldCheck } from 'lucide-react';
import { Product, Category, OrderLog, OrderLineItem, supabase, formatR, haversineDistance, WHATSAPP, FLEET, OrderStatus } from '../lib/supabase';
import { cacheManifest, getCachedManifest } from '../lib/offline';
import { useOrders } from '../hooks/useOrders';
import { useSettings } from '../hooks/useSettings';

interface AdminPanelProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  categories: Category[];
  isOpen: boolean;
  onClose: () => void;
}

type AdminTab = 'inventory' | 'accounting' | 'logistics' | 'analytics' | 'settings';

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  captured: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  dispatched: 'bg-sky-50 text-sky-700 border border-sky-200',
  delivered: 'bg-slate-100 text-slate-500 border border-slate-200',
  cancelled: 'bg-red-50 text-red-600 border border-red-200',
};

const STATUS_DOT: Record<OrderStatus, string> = {
  pending: 'bg-amber-400',
  captured: 'bg-emerald-500',
  dispatched: 'bg-sky-500',
  delivered: 'bg-slate-400',
  cancelled: 'bg-red-500',
};

export function AdminPanel({ products, setProducts, categories, isOpen, onClose }: AdminPanelProps) {
  const { orders, updateOrderStatus, assignVehicle } = useOrders();
  const { adminPin, cartDisabled, updateSetting } = useSettings();
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('inventory');
  const [newPin, setNewPin] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [pinSaved, setPinSaved] = useState(false);

  // Inventory state
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState<Record<string, boolean>>({});
  const [togglingStock, setTogglingStock] = useState<Record<string, boolean>>({});
  const [deletingProduct, setDeletingProduct] = useState<string | null>(null);
  const [deletingInProgress, setDeletingInProgress] = useState<string | null>(null);
  const [inventorySearch, setInventorySearch] = useState('');
  const [editingName, setEditingName] = useState<Record<string, string>>({});
  const [uploadingImage, setUploadingImage] = useState<Record<string, boolean>>({});
  const [localImageUrls, setLocalImageUrls] = useState<Record<string, string>>({});
  const [optimisticStock, setOptimisticStock] = useState<Record<string, boolean>>({});
  const [optimisticFeatured, setOptimisticFeatured] = useState<Record<string, boolean>>({});
  const [optimisticLowStock, setOptimisticLowStock] = useState<Record<string, boolean>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [newRowDraft, setNewRowDraft] = useState<{
    name: string; variant_label: string; price: string; sale_price: string;
    image_url: string; description: string; saving: boolean; selectedCats: string[];
  } | null>(null);
  const newRowFileRef = useRef<HTMLInputElement>(null);
  const deleteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Logistics state
  const [logisticsDate, setLogisticsDate] = useState(new Date().toISOString().split('T')[0]);
  const [vehicleAllocations, setVehicleAllocations] = useState<Record<string, OrderLog[]>>({});
  const [routingCalculated, setRoutingCalculated] = useState(false);

  // Analytics
  const [supplyAlerts, setSupplyAlerts] = useState<Product[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setAuthenticated(false);
      setPin('');
      setPinError('');
      setActiveTab('inventory');
      setNewPin('');
      setShowNewPin(false);
      setPinSaved(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const alerts = products.filter((p) => p.supply_alert_state !== 'normal');
    setSupplyAlerts(alerts);
  }, [products]);

  // INVENTORY OPERATIONS
  const toggleStock = async (product: Product) => {
    const newVal = !(optimisticStock[product.id] ?? product.is_in_stock);
    setOptimisticStock((prev) => ({ ...prev, [product.id]: newVal }));
    setTogglingStock((prev) => ({ ...prev, [product.id]: true }));
    const { error } = await supabase.from('products').update({ is_in_stock: newVal }).eq('id', product.id);
    if (error) setOptimisticStock((prev) => ({ ...prev, [product.id]: !newVal }));
    setTogglingStock((prev) => ({ ...prev, [product.id]: false }));
  };

  const toggleFeatured = async (product: Product) => {
    const newVal = !(optimisticFeatured[product.id] ?? product.is_featured);
    setOptimisticFeatured((prev) => ({ ...prev, [product.id]: newVal }));
    const { error } = await supabase.from('products').update({ is_featured: newVal }).eq('id', product.id);
    if (error) setOptimisticFeatured((prev) => ({ ...prev, [product.id]: !newVal }));
  };

  const toggleLowStock = async (product: Product) => {
    const newVal = !(optimisticLowStock[product.id] ?? product.is_low_stock);
    setOptimisticLowStock((prev) => ({ ...prev, [product.id]: newVal }));
    const { error } = await supabase.from('products').update({ is_low_stock: newVal }).eq('id', product.id);
    if (error) setOptimisticLowStock((prev) => ({ ...prev, [product.id]: !newVal }));
  };

  const handleFieldBlur = async (product: Product, field: string, value: string) => {
    const key = `${product.id}-${field}`;
    if (field === 'price' || field === 'sale_price') {
      if (value.trim() === '' && field === 'sale_price') {
        setSavingPrices((prev) => ({ ...prev, [key]: true }));
        await supabase.from('products').update({ sale_price: null }).eq('id', product.id);
        setSavingPrices((prev) => ({ ...prev, [key]: false }));
        setEditingPrices((prev) => { const n = { ...prev }; delete n[key]; return n; });
        return;
      }
      const num = parseFloat(value);
      if (isNaN(num) || num < 0) {
        setEditingPrices((prev) => { const n = { ...prev }; delete n[key]; return n; });
        return;
      }

      if (field === 'sale_price') {
        if (num >= product.price) {
          setEditingPrices((prev) => { const n = { ...prev }; delete n[key]; return n; });
          return;
        }
      }

      if (field === 'price') {
        // If the new price is at or below the current sale price, clear sale price automatically
        const saleKey = `${product.id}-sale_price`;
        const effectiveSale = parseFloat(product.sale_price?.toString() ?? '');
        if (!isNaN(effectiveSale) && num <= effectiveSale) {
          setSavingPrices((prev) => ({ ...prev, [key]: true, [saleKey]: true }));
          await supabase.from('products').update({ price: num, sale_price: null }).eq('id', product.id);
          setSavingPrices((prev) => ({ ...prev, [key]: false, [saleKey]: false }));
          setEditingPrices((prev) => { const n = { ...prev, [key]: num.toString() }; delete n[saleKey]; return n; });
          return;
        }
      }

      setSavingPrices((prev) => ({ ...prev, [key]: true }));
      await supabase.from('products').update({ [field]: num }).eq('id', product.id);
      setSavingPrices((prev) => ({ ...prev, [key]: false }));
      setEditingPrices((prev) => ({ ...prev, [key]: num.toString() }));
    } else if (field === 'name' || field === 'description' || field === 'variant_label') {
      if (!value.trim()) return;
      await supabase.from('products').update({ [field]: value }).eq('id', product.id);
      if (field === 'name') setEditingName((prev: Record<string, string>) => { const n = { ...prev }; delete n[product.id]; return n; });
    }
  };

  const deleteProduct = async (productId: string) => {
    if (deletingProduct !== productId) {
      // First click: enter confirmation state with 4-second auto-reset
      setDeletingProduct(productId);
      if (deleteTimers.current[productId]) clearTimeout(deleteTimers.current[productId]);
      deleteTimers.current[productId] = setTimeout(() => {
        setDeletingProduct((curr) => curr === productId ? null : curr);
        delete deleteTimers.current[productId];
      }, 4000);
      return;
    }
    // Confirmed: cancel timer, mark as in-progress (keep confirm button visible), then delete
    if (deleteTimers.current[productId]) {
      clearTimeout(deleteTimers.current[productId]);
      delete deleteTimers.current[productId];
    }
    setDeletingInProgress(productId);
    // Optimistically remove from local list immediately
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) {
      console.error('Delete error:', error);
      // Rollback: re-fetch is handled by realtime; just clear state
    }
    setDeletingInProgress(null);
    setDeletingProduct(null);
  };

  const handleImageUpload = (productId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      if (!base64) return;
      // Show preview immediately
      setLocalImageUrls((prev) => ({ ...prev, [productId]: base64 }));
      setUploadingImage((prev) => ({ ...prev, [productId]: true }));
      await supabase.from('products').update({ image_url: base64 }).eq('id', productId);
      setUploadingImage((prev) => ({ ...prev, [productId]: false }));
    };
    reader.readAsDataURL(file);
  };

  const initializeNewRow = async () => {
    setNewRowDraft({ name: '', variant_label: '', price: '0.00', sale_price: '', image_url: '', description: '', saving: false, selectedCats: [] });
  };

  const saveNewRow = async () => {
    if (!newRowDraft || !newRowDraft.name.trim()) return;
    const draft = { ...newRowDraft };

    const price = parseFloat(draft.price) || 0;
    const sale_price = draft.sale_price.trim() ? parseFloat(draft.sale_price) : null;
    const selectedCats = draft.selectedCats || [];
    const now = new Date().toISOString();

    // Build a full optimistic product so the row appears immediately
    const tempId = `temp-${Date.now()}`;
    const optimisticProduct: Product = {
      id: tempId,
      name: draft.name.trim(),
      variant_label: draft.variant_label.trim(),
      description: draft.description.trim() || draft.name.trim(),
      price,
      sale_price,
      image_url: draft.image_url || 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=400',
      is_in_stock: true,
      is_low_stock: false,
      is_featured: false,
      is_auto_discounted: false,
      days_unordered_counter: 0,
      parent_id: null,
      created_at: now,
      last_promoted_at: now,
      supply_alert_state: 'normal',
    };

    // Show immediately — close form and add product without waiting for DB
    setProducts((prev) => [...prev, optimisticProduct]);
    setNewRowDraft(null);

    const { data: inserted, error } = await supabase.from('products').insert({
      name: optimisticProduct.name,
      variant_label: optimisticProduct.variant_label,
      description: optimisticProduct.description,
      price,
      sale_price,
      image_url: optimisticProduct.image_url,
      is_in_stock: true,
      is_low_stock: false,
      is_featured: false,
      is_auto_discounted: false,
      days_unordered_counter: 0,
    }).select('*').maybeSingle();

    if (error || !inserted) {
      console.error('Insert product error:', error);
      // Rollback optimistic entry
      setProducts((prev) => prev.filter((p) => p.id !== tempId));
      return;
    }

    // Replace temp entry with real DB record (has real id, timestamps, etc.)
    setProducts((prev) => prev.map((p) => p.id === tempId ? inserted as Product : p));

    if (selectedCats.length > 0) {
      const { error: catError } = await supabase.from('product_categories').insert(
        selectedCats.map((catId, idx) => ({ product_id: inserted.id, category_id: catId, display_order_within_category: idx + 1 }))
      );
      if (catError) console.error('Insert product_categories error:', catError);
    }
  };

  const handleNewRowImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      if (base64) setNewRowDraft((p) => p ? { ...p, image_url: base64 } : null);
    };
    reader.readAsDataURL(file);
  };

  const handleSavePin = async () => {
    const trimmed = newPin.trim();
    if (!/^\d{4,6}$/.test(trimmed)) return;
    setSavingPin(true);
    await updateSetting('admin_pin', trimmed);
    setNewPin('');
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 2000);
    setSavingPin(false);
  };

  const calculateRouting = useCallback(async () => {
    const dateOrders = orders.filter(
      (o) => o.requested_delivery_date === logisticsDate && o.status === 'captured'
    );
    if (dateOrders.length === 0) { setVehicleAllocations({}); setRoutingCalculated(true); return; }

    const scored = dateOrders.map((order) => {
      const oLat = order.coordinates_lat;
      const oLng = order.coordinates_lng;
      let densityScore = 0;
      if (oLat != null && oLng != null) {
        for (const other of dateOrders) {
          if (other.id === order.id) continue;
          const otherLat = other.coordinates_lat;
          const otherLng = other.coordinates_lng;
          if (otherLat != null && otherLng != null) {
            const dist = haversineDistance(oLat, oLng, otherLat, otherLng);
            if (dist < 10) densityScore += 3;
            else if (dist < 20) densityScore += 1;
          }
        }
      }
      return { order, score: densityScore * 1000 + order.total_amount };
    });
    scored.sort((a, b) => b.score - a.score);
    const sortedOrders = scored.map((s) => s.order);

    const isuzu: OrderLog[] = [];
    const gwmDiesel: OrderLog[] = [];
    const gwmPetrol: OrderLog[] = [];
    let isuzuCap = 0, dieselCap = 0, petrolCap = 0;

    for (const order of sortedOrders) {
      if (isuzuCap + order.total_amount <= 70000 && isuzu.length < 15) {
        isuzu.push(order); isuzuCap += order.total_amount;
      } else if (dieselCap + order.total_amount <= 30000 && gwmDiesel.length < 10) {
        gwmDiesel.push(order); dieselCap += order.total_amount;
      } else if (petrolCap + order.total_amount <= 25000 && gwmPetrol.length < 10) {
        gwmPetrol.push(order); petrolCap += order.total_amount;
      }
    }

    const allocations = { 'isuzu-nqr500': isuzu, 'gwm-diesel': gwmDiesel, 'gwm-petrol': gwmPetrol };
    setVehicleAllocations(allocations);
    setRoutingCalculated(true);

    for (const [vehicleId, vOrders] of Object.entries(allocations)) {
      vOrders.forEach((order, idx) => { assignVehicle(order.id, vehicleId, idx + 1); });
    }

    await cacheManifest({
      date: logisticsDate,
      allocations: Object.fromEntries(Object.entries(allocations).map(([k, v]) => [k, v as unknown[]])),
      createdAt: Date.now(),
    });
  }, [orders, logisticsDate, assignVehicle]);

  const generateTripSheet = async () => {
    // Open print window immediately (synchronous, preserves user gesture for popup allow)
    const printWindow = window.open('', '_blank');

    let allocs = vehicleAllocations;
    if (!routingCalculated) {
      const cached = await getCachedManifest(logisticsDate);
      if (cached) {
        allocs = cached.allocations as Record<string, OrderLog[]>;
      } else {
        printWindow?.close();
        return;
      }
    }
    const hasOrders = Object.values(allocs).some((v) => v.length > 0);
    if (!hasOrders) { printWindow?.close(); return; }

    let html = `<html><head><title>Taza Direct - Trip Sheet ${logisticsDate}</title><style>
      body { font-family: Arial, sans-serif; margin: 20px; color: #0F172A; }
      h1 { color: #0F172A; border-bottom: 2px solid #F59E0B; padding-bottom: 8px; }
      h2 { color: #334155; margin-top: 20px; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0 20px; font-size: 11px; }
      th { background: #0F172A; color: white; padding: 8px 6px; text-align: left; }
      td { padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
      tr:nth-child(even) { background: #F8FAFC; }
      .sign-block { margin-top: 40px; border-top: 1px solid #94A3B8; padding-top: 12px; }
      .sign-line { display: inline-block; width: 220px; border-bottom: 1px solid #0F172A; margin-right: 30px; }
      .footer { margin-top: 30px; font-size: 10px; color: #64748B; border-top: 1px solid #CBD5E1; padding-top: 8px; }
      .eta { color: #059669; font-weight: bold; }
    </style></head><body>`;
    html += `<h1>Taza Direct - Delivery Trip Sheet</h1>`;
    html += `<p><strong>Date:</strong> ${logisticsDate} &nbsp;|&nbsp; <strong>Loading:</strong> 08:00 - 10:00 &nbsp;|&nbsp; <strong>First Drop:</strong> 10:00 AM</p>`;

    let whatsAppMsg = `TRIP SHEET - TAZA DIRECT\nDate: ${logisticsDate}\nLoading: 08:00-10:00 | First Drop: 10:00\n\n`;

    for (const [vehicleId, vOrders] of Object.entries(allocs)) {
      const vehicle = FLEET.find((v) => v.id === vehicleId);
      if (!vehicle || vOrders.length === 0) continue;
      const totalVal = vOrders.reduce((s, o) => s + o.total_amount, 0);
      html += `<h2>${vehicle.name} &mdash; ${vOrders.length} stops &mdash; R${totalVal.toFixed(2)} load</h2>`;
      html += `<table><tr><th>Stop</th><th>ETA</th><th>Shop</th><th>Address</th><th>Value</th><th>Payment</th><th>Notes</th></tr>`;
      whatsAppMsg += `${vehicle.name} (${vOrders.length} stops | R${totalVal.toFixed(2)}):\n`;
      vOrders.forEach((order, idx) => {
        const etaMinutes = 10 * 60 + idx * 30;
        const etaH = Math.floor(etaMinutes / 60);
        const etaM = String(etaMinutes % 60).padStart(2, '0');
        const eta = `${etaH}:${etaM}`;
        const pt = order.payment_terms || 'COD';
        const notes = order.order_notes || '';
        const suppBadge = order.is_supplement ? ' [SUPP]' : '';
        html += `<tr><td>${idx + 1}${suppBadge}</td><td class="eta">${eta}</td><td>${order.shop_name}</td><td>${order.address}</td><td>R${order.total_amount.toFixed(2)}</td><td>${pt}</td><td>${notes}</td></tr>`;
        whatsAppMsg += `  Stop ${idx + 1} [${eta}]: ${order.shop_name} - ${pt}${order.is_supplement ? ' (SUPPLEMENT)' : ''}\n`;
      });
      html += `<tr><td colspan="4" style="text-align:right;font-weight:bold">Total Load:</td><td style="font-weight:bold">R${totalVal.toFixed(2)}</td><td colspan="2"></td></tr></table>`;
      whatsAppMsg += `\n`;
    }

    html += `<div class="sign-block"><p><strong>Driver Acknowledgment Sign-off</strong></p>
      <p>Driver Name:&nbsp;<span class="sign-line"></span>&nbsp; Signature:&nbsp;<span class="sign-line"></span>&nbsp; Date:&nbsp;<span class="sign-line"></span></p>
      <p style="margin-top:16px">Dispatcher:&nbsp;<span class="sign-line"></span>&nbsp; Signature:&nbsp;<span class="sign-line"></span></p></div>`;
    html += `<div class="footer">All prices are inclusive of VAT where applicable. | Taza Direct - Towerhive Business Park, 3 Caxton Street, Industria, Johannesburg</div></body></html>`;

    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }

    whatsAppMsg += `All prices are inclusive of VAT where applicable.`;
    const ownerUrl = `https://wa.me/${WHATSAPP.OWNER}?text=${encodeURIComponent(whatsAppMsg)}`;
    const stockUrl = `https://wa.me/${WHATSAPP.STOCK_CONTROLLER}?text=${encodeURIComponent(whatsAppMsg)}`;
    window.open(ownerUrl, '_blank');
    setTimeout(() => window.open(stockUrl, '_blank'), 500);
  };

  const confirmSupplierOOS = async (productId: string) => {
    await supabase.from('products').update({ supply_alert_state: 'confirmed_oos', is_in_stock: false }).eq('id', productId);
  };

  const forceReopenStock = async (productId: string) => {
    await supabase.from('products').update({ supply_alert_state: 'normal', is_in_stock: true, days_unordered_counter: 0 }).eq('id', productId);
  };

  const resetLoop = async (productId: string) => {
    await supabase.from('products').update({ supply_alert_state: 'normal', days_unordered_counter: 0 }).eq('id', productId);
  };

  const ignoreUntilReopened = async (productId: string) => {
    await supabase.from('products').update({ supply_alert_state: 'confirmed_oos' }).eq('id', productId);
  };

  const copyOrderCode = (order: OrderLog) => {
    const lines = order.order_data.map((item: OrderLineItem) => `${item.name}\t${item.quantity}`).join('\n');
    navigator.clipboard.writeText(lines).catch(() => {});
  };

  const copyOrderQty = (order: OrderLog) => {
    const lines = order.order_data.map((item: OrderLineItem) => `${item.quantity}\t${item.unitPrice}`).join('\n');
    navigator.clipboard.writeText(lines).catch(() => {});
  };

  if (!isOpen) return null;

  const currentPin = adminPin;
  const hasPin = currentPin.length > 0;

  const filteredInventory = inventorySearch
    ? products.filter((p) => p.name.toLowerCase().includes(inventorySearch.toLowerCase()) || p.variant_label.toLowerCase().includes(inventorySearch.toLowerCase()))
    : products;

  const logisticsOrders = orders.filter((o) => o.requested_delivery_date === logisticsDate && o.status !== 'cancelled');
  const pendingOrders = logisticsOrders.filter((o) => o.status === 'pending');
  const capturedOrders = logisticsOrders.filter((o) => o.status === 'captured');

  const totalRevenue = orders.filter((o) => o.status === 'delivered' || o.status === 'dispatched').reduce((s, o) => s + o.total_amount, 0);
  const pendingValue = orders.filter((o) => o.status === 'pending' || o.status === 'captured').reduce((s, o) => s + o.total_amount, 0);
  const slowMovers = products.filter((p) => p.days_unordered_counter >= 14 && p.is_in_stock).sort((a, b) => b.days_unordered_counter - a.days_unordered_counter);

  const tabs: { key: AdminTab; icon: typeof Package; label: string; badge?: number }[] = [
    { key: 'inventory', icon: Package, label: 'Inventory' },
    { key: 'accounting', icon: ClipboardList, label: 'Orders', badge: orders.filter((o) => o.status === 'pending').length },
    { key: 'logistics', icon: Truck, label: 'Logistics' },
    { key: 'analytics', icon: BarChart3, label: 'Analytics', badge: supplyAlerts.length || undefined },
    { key: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ animation: 'fadeIn 150ms ease-out' }}
      onClick={onClose}
    >
      <div
        className="bg-[#F8FAFC] w-full max-w-md max-h-[95vh] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ animation: 'slideUp 200ms cubic-bezier(0.16,1,0.3,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — glassmorphism */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
              <ShieldCheck size={16} className="text-slate-900" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">Admin Dashboard</h2>
              <p className="text-[10px] text-slate-400 leading-tight">Taza Direct Operations</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all duration-150 min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        {/* PIN screen */}
        {!authenticated ? (
          <div className="p-8 flex flex-col items-center justify-center bg-white min-h-[340px]">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center mb-5 shadow-lg">
              <img src="/logo_white.jpg" alt="Taza Direct" className="h-10 object-contain" />
            </div>
            <h3 className="font-bold text-slate-900 text-lg mb-1">
              {hasPin ? 'Enter Admin PIN' : 'Create Admin PIN'}
            </h3>
            <p className="text-sm text-slate-400 mb-6 text-center max-w-[220px]">
              {hasPin ? 'Enter your PIN to access the dashboard' : 'Set a 4-6 digit PIN to secure admin access'}
            </p>
            <div className="flex gap-2.5 mb-5">
              {[0, 1, 2, 3, 4, 5].slice(0, hasPin ? 4 : 6).map((i) => (
                <div
                  key={i}
                  className={`w-11 h-13 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all duration-150 ${
                    i < pin.length ? 'border-amber-500 bg-amber-50 scale-105' : 'border-slate-200 bg-slate-50'
                  }`}
                  style={{ height: '52px', width: '44px' }}
                >
                  {i < pin.length ? '\u2022' : ''}
                </div>
              ))}
            </div>
            {pinError && (
              <p className="text-red-500 text-sm mb-3 font-medium">{pinError}</p>
            )}
            <div className="grid grid-cols-3 gap-2 w-full max-w-[240px]">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'del'].map((key, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (key === 'del') { setPin((p) => p.slice(0, -1)); setPinError(''); }
                    else if (key !== '' && pin.length < (hasPin ? 4 : 6)) {
                      const entered = pin + key;
                      setPin(entered);
                      setPinError('');
                      if (hasPin && entered.length === currentPin.length) {
                        setTimeout(() => {
                          if (entered === currentPin) setAuthenticated(true);
                          else { setPinError('Incorrect PIN'); setPin(''); }
                        }, 200);
                      } else if (!hasPin && entered.length >= 4) {
                        updateSetting('admin_pin', entered).then(() => setAuthenticated(true));
                      }
                    }
                  }}
                  disabled={key === ''}
                  className={`h-12 rounded-xl font-semibold text-base transition-all duration-150 active:scale-95 ${
                    key === 'del'
                      ? 'bg-slate-100 text-slate-500 hover:bg-slate-200 text-sm'
                      : key === ''
                      ? 'invisible'
                      : 'bg-white text-slate-900 hover:bg-slate-50 border border-slate-200 shadow-sm hover:shadow-md'
                  }`}
                >
                  {key === 'del' ? 'Del' : key}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Tab Bar */}
            <div className="flex gap-1 px-3 py-2.5 border-b border-[#E2E8F0] bg-white/80 backdrop-blur-md overflow-x-auto shrink-0">
              {tabs.map(({ key, icon: Icon, label, badge }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap min-h-[40px] ${
                    activeTab === key
                      ? 'bg-slate-900 text-amber-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                  {badge ? (
                    <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${
                      activeTab === key ? 'bg-amber-500 text-slate-900' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto bg-[#F8FAFC]">

              {/* ==================== INVENTORY TAB ==================== */}
              {activeTab === 'inventory' && (
                <div className="p-4 space-y-3">
                  {/* Search */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search inventory..."
                      value={inventorySearch}
                      onChange={(e) => setInventorySearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-white rounded-xl text-sm border border-[#E2E8F0] focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all duration-150 shadow-sm hover:shadow-md min-h-[44px]"
                    />
                  </div>

                  {/* Add New Product */}
                  <button
                    onClick={initializeNewRow}
                    disabled={!!newRowDraft}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 text-amber-700 font-semibold text-sm hover:bg-amber-50 hover:border-amber-400 active:scale-[0.99] transition-all duration-150 disabled:opacity-40 min-h-[44px]"
                  >
                    <Plus size={15} />
                    Initialize New Product Row
                  </button>

                  {/* New Row Draft Form */}
                  {newRowDraft && (
                    <div className="bg-white border border-amber-200 rounded-xl p-4 space-y-3 shadow-md">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">New Product Draft</p>
                      </div>

                      <div className="flex items-start gap-3">
                        <div
                          className="w-16 h-16 rounded-xl border-2 border-dashed border-amber-200 bg-slate-50 flex items-center justify-center cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-all duration-150 overflow-hidden shrink-0"
                          onClick={() => newRowFileRef.current?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files[0];
                            if (file && file.type.startsWith('image/')) handleNewRowImageUpload(file);
                          }}
                        >
                          {newRowDraft.image_url
                            ? <img src={newRowDraft.image_url} alt="preview" className="w-full h-full object-cover" />
                            : <ImageIcon size={20} className="text-slate-300" />
                          }
                        </div>
                        <input ref={newRowFileRef} type="file" accept="image/*" capture="environment" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleNewRowImageUpload(f); }} />
                        <div className="flex-1 space-y-2">
                          <input type="text" placeholder="Product Name *" value={newRowDraft.name}
                            onChange={(e) => setNewRowDraft((p) => p ? { ...p, name: e.target.value } : null)}
                            className="w-full px-3 py-2 text-sm bg-slate-50 border border-[#E2E8F0] rounded-lg focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none min-h-[38px] transition-all" />
                          <input type="text" placeholder="Variant (e.g. 1kg, 500ml)" value={newRowDraft.variant_label}
                            onChange={(e) => setNewRowDraft((p) => p ? { ...p, variant_label: e.target.value } : null)}
                            className="w-full px-3 py-2 text-sm bg-slate-50 border border-[#E2E8F0] rounded-lg focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none min-h-[38px] transition-all" />
                        </div>
                      </div>

                      {(() => {
                        const draftPrice = parseFloat(newRowDraft.price) || 0;
                        const draftSale = newRowDraft.sale_price.trim() ? parseFloat(newRowDraft.sale_price) : null;
                        const salePriceError = draftSale !== null && draftSale >= draftPrice;
                        return (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] text-[#64748B] font-bold uppercase tracking-wider mb-1 block">Price (R)</label>
                              <input type="number" min="0" step="0.01" value={newRowDraft.price}
                                onChange={(e) => setNewRowDraft((p) => p ? { ...p, price: e.target.value } : null)}
                                className="w-full px-3 py-2 text-sm bg-slate-50 border border-[#E2E8F0] rounded-lg focus:border-amber-400 outline-none min-h-[38px] transition-all" />
                            </div>
                            <div>
                              <label className="text-[9px] text-[#64748B] font-bold uppercase tracking-wider mb-1 block">Sale Price (R)</label>
                              <input type="number" min="0" step="0.01" placeholder="Leave blank for none" value={newRowDraft.sale_price}
                                onChange={(e) => setNewRowDraft((p) => p ? { ...p, sale_price: e.target.value } : null)}
                                className={`w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg outline-none min-h-[38px] transition-all ${salePriceError ? 'border-red-400 focus:border-red-400' : 'border-[#E2E8F0] focus:border-amber-400'}`} />
                              {salePriceError && <p className="text-[9px] text-red-500 font-semibold mt-1">Must be lower than price</p>}
                            </div>
                          </div>
                        );
                      })()}

                      <input type="text" placeholder="Description (optional)"
                        value={newRowDraft.description}
                        onChange={(e) => setNewRowDraft((p) => p ? { ...p, description: e.target.value } : null)}
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-[#E2E8F0] rounded-lg focus:border-amber-400 outline-none min-h-[38px] transition-all" />

                      {categories.filter((c) => c.name !== 'ALL ITEMS').length > 0 && (
                        <div>
                          <p className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider mb-2 flex items-center gap-1"><Tag size={9} /> Categories</p>
                          <div className="flex flex-wrap gap-1.5">
                            {categories.filter((c) => c.name !== 'ALL ITEMS').map((cat) => {
                              const sel = newRowDraft.selectedCats.includes(cat.id);
                              return (
                                <button key={cat.id} type="button"
                                  onClick={() => setNewRowDraft((p) => {
                                    if (!p) return p;
                                    const next = sel ? p.selectedCats.filter((id) => id !== cat.id) : [...p.selectedCats, cat.id];
                                    return { ...p, selectedCats: next };
                                  })}
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all duration-150 ${sel ? 'bg-amber-500 text-slate-900 shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                                  {sel && <Check size={8} className="inline mr-0.5" />}{cat.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 pt-1">
                        <button type="button" onClick={saveNewRow} disabled={!newRowDraft.name.trim() || newRowDraft.saving || (() => { const p = parseFloat(newRowDraft.price) || 0; const s = newRowDraft.sale_price.trim() ? parseFloat(newRowDraft.sale_price) : null; return s !== null && s >= p; })()}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-amber-500 text-slate-900 font-bold text-sm rounded-xl hover:bg-amber-600 active:scale-[0.98] disabled:opacity-40 min-h-[44px] transition-all duration-150 shadow-sm">
                          {newRowDraft.saving ? <span className="animate-pulse">Saving...</span> : <><Check size={14} /> Save Product</>}
                        </button>
                        <button type="button" onClick={() => setNewRowDraft(null)}
                          className="px-5 py-2.5 bg-slate-100 text-slate-600 font-semibold text-sm rounded-xl hover:bg-slate-200 active:scale-[0.98] min-h-[44px] transition-all duration-150">
                          Discard
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inventory Ledger */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                    {/* Ledger Header */}
                    <div className="grid grid-cols-12 gap-1 px-3 py-2.5 bg-slate-50 border-b border-[#E2E8F0]">
                      <div className="col-span-1 text-[9px] font-bold text-[#64748B] uppercase tracking-wider">Img</div>
                      <div className="col-span-3 text-[9px] font-bold text-[#64748B] uppercase tracking-wider">Product</div>
                      <div className="col-span-2 text-[9px] font-bold text-[#64748B] uppercase tracking-wider">Price</div>
                      <div className="col-span-2 text-[9px] font-bold text-[#64748B] uppercase tracking-wider">Sale</div>
                      <div className="col-span-1 text-[9px] font-bold text-[#64748B] uppercase tracking-wider text-center">In</div>
                      <div className="col-span-1 text-[9px] font-bold text-[#64748B] uppercase tracking-wider text-center">Low</div>
                      <div className="col-span-1 text-[9px] font-bold text-[#64748B] uppercase tracking-wider text-center">Feat</div>
                      <div className="col-span-1 text-[9px] font-bold text-[#64748B] uppercase tracking-wider text-center">Del</div>
                    </div>

                    {filteredInventory.filter((p) => deletingInProgress !== p.id).map((product, rowIdx) => {
                      const inStock = optimisticStock[product.id] ?? product.is_in_stock;
                      const isFeatured = optimisticFeatured[product.id] ?? product.is_featured;
                      const isLowStock = optimisticLowStock[product.id] ?? product.is_low_stock;
                      const isOOS = !inStock;
                      const isZebra = rowIdx % 2 === 1;
                      const editPrice = editingPrices[`${product.id}-price`];
                      const editSale = editingPrices[`${product.id}-sale_price`];
                      const displayPrice = editPrice !== undefined ? editPrice : product.price.toString();
                      const displaySale = editSale !== undefined ? editSale : (product.sale_price?.toString() || '');
                      const savingP = savingPrices[`${product.id}-price`];
                      const savingS = savingPrices[`${product.id}-sale_price`];
                      const isToggling = togglingStock[product.id];
                      const isDeleting = deletingProduct === product.id;
                      const isDeleteInProgress = deletingInProgress === product.id;
                      const isUploading = uploadingImage[product.id];
                      const isExpanded = expandedRow === product.id;

                      return (
                        <div
                          key={product.id}
                          className={`border-b border-[#E2E8F0] last:border-0 transition-all duration-150 ${
                            isOOS ? 'opacity-50' : isZebra ? 'bg-[#F1F5F9]' : 'bg-white'
                          } hover:bg-amber-50/30`}
                        >
                          <div className="grid grid-cols-12 gap-1 px-3 py-3 items-center">
                            {/* Image */}
                            <div className="col-span-1 flex justify-center">
                              <label
                                className={`relative w-9 h-9 rounded-lg overflow-hidden cursor-pointer group border border-[#E2E8F0] ${isUploading ? 'opacity-60' : ''}`}
                                title="Click to upload image"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  const file = e.dataTransfer.files[0];
                                  if (file && file.type.startsWith('image/')) handleImageUpload(product.id, file);
                                }}
                              >
                                {(localImageUrls[product.id] || product.image_url)
                                  ? <img src={localImageUrls[product.id] || product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                  : <div className="w-full h-full bg-slate-100 flex items-center justify-center"><ImageIcon size={11} className="text-slate-300" /></div>
                                }
                                <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Upload size={9} className="text-white" />
                                </div>
                                <input type="file" accept="image/*" className="hidden"
                                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(product.id, f); }} />
                                {isUploading && <div className="absolute inset-0 bg-white/70 flex items-center justify-center"><span className="text-[7px] text-amber-600 font-bold animate-pulse">...</span></div>}
                              </label>
                            </div>

                            {/* Product Name */}
                            <div className="col-span-3 min-w-0">
                              <input
                                type="text"
                                value={editingName[product.id] !== undefined ? editingName[product.id] : product.name}
                                onChange={(e) => setEditingName((prev) => ({ ...prev, [product.id]: e.target.value }))}
                                onBlur={() => { if (editingName[product.id] !== undefined) handleFieldBlur(product, 'name', editingName[product.id]); }}
                                className={`w-full text-xs font-semibold bg-transparent border-b border-transparent hover:border-slate-200 focus:border-amber-400 outline-none py-0.5 truncate transition-colors ${isOOS ? 'text-slate-400 line-through' : 'text-slate-900'}`}
                              />
                              <div className="flex items-center gap-1">
                                {product.variant_label && <span className="text-[9px] text-slate-400 truncate">({product.variant_label})</span>}
                                {product.is_auto_discounted && <Flame size={8} className="text-emerald-500 shrink-0" />}
                                <button
                                  onClick={() => setExpandedRow(isExpanded ? null : product.id)}
                                  className="text-[9px] text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-0.5 shrink-0"
                                >
                                  <Tag size={8} /> cats
                                </button>
                              </div>
                            </div>

                            {/* Price */}
                            <div className="col-span-2">
                              <input
                                type="text"
                                value={displayPrice}
                                onFocus={(e) => { setEditingPrices((prev) => ({ ...prev, [`${product.id}-price`]: product.price.toString() })); e.currentTarget.dataset.val = product.price.toString(); }}
                                onChange={(e) => { setEditingPrices((prev) => ({ ...prev, [`${product.id}-price`]: e.target.value })); e.currentTarget.dataset.val = e.target.value; }}
                                onBlur={(e) => handleFieldBlur(product, 'price', e.currentTarget.dataset.val ?? product.price.toString())}
                                className="w-full text-xs font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-amber-400 outline-none py-0.5 transition-colors"
                              />
                              {savingP && <span className="text-[8px] text-amber-500 animate-pulse">saving</span>}
                            </div>

                            {/* Sale Price */}
                            <div className="col-span-2">
                              <input
                                type="text"
                                value={displaySale}
                                placeholder="—"
                                onFocus={(e) => { setEditingPrices((prev) => ({ ...prev, [`${product.id}-sale_price`]: product.sale_price?.toString() ?? '' })); e.currentTarget.dataset.val = product.sale_price?.toString() ?? ''; }}
                                onChange={(e) => { setEditingPrices((prev) => ({ ...prev, [`${product.id}-sale_price`]: e.target.value })); e.currentTarget.dataset.val = e.target.value; }}
                                onBlur={(e) => handleFieldBlur(product, 'sale_price', e.currentTarget.dataset.val ?? product.sale_price?.toString() ?? '')}
                                className="w-full text-xs font-bold text-emerald-600 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-amber-400 outline-none py-0.5 transition-colors"
                              />
                              {savingS && <span className="text-[8px] text-amber-500 animate-pulse">saving</span>}
                            </div>

                            {/* Stock Toggle */}
                            <div className="col-span-1 flex justify-center">
                              <button
                                type="button"
                                onClick={() => toggleStock(product)}
                                disabled={isToggling}
                                className={`relative w-9 h-5 rounded-full transition-all duration-200 shadow-inner ${inStock ? 'bg-emerald-500' : 'bg-slate-300'} ${isToggling ? 'opacity-60' : ''}`}
                              >
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${inStock ? 'translate-x-4' : 'translate-x-0'}`} />
                              </button>
                            </div>

                            {/* Low Stock Toggle */}
                            <div className="col-span-1 flex justify-center">
                              <button
                                type="button"
                                onClick={() => toggleLowStock(product)}
                                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-amber-50 transition-all duration-150"
                              >
                                <AlertTriangle size={13} className={isLowStock ? 'text-amber-500' : 'text-slate-200'} />
                              </button>
                            </div>

                            {/* Featured Toggle */}
                            <div className="col-span-1 flex justify-center">
                              <button
                                type="button"
                                onClick={() => toggleFeatured(product)}
                                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-amber-50 transition-all duration-150"
                              >
                                <Star size={13} fill={isFeatured ? 'currentColor' : 'none'} className={isFeatured ? 'text-amber-400' : 'text-slate-200'} />
                              </button>
                            </div>

                            {/* Delete */}
                            <div className="col-span-1 flex justify-center">
                              {isDeleteInProgress ? (
                                <span className="text-[8px] text-red-500 animate-pulse font-bold min-w-[36px] text-center">...</span>
                              ) : isDeleting ? (
                                <button
                                  type="button"
                                  onClick={() => deleteProduct(product.id)}
                                  className="px-1 py-1 rounded-lg bg-red-600 text-white text-[8px] font-bold hover:bg-red-700 active:scale-95 transition-all duration-150 min-h-[36px] min-w-[36px] leading-tight text-center"
                                >
                                  Confirm
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => deleteProduct(product.id)}
                                  className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-1 rounded-lg transition-all duration-150 min-w-[36px] min-h-[36px] flex items-center justify-center"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Expanded Category Selector */}
                          {isExpanded && (
                            <div className="px-4 pb-3 pt-1 border-t border-[#E2E8F0] bg-slate-50/60">
                              <p className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider mb-2 flex items-center gap-1">
                                <Tag size={8} /> Categories
                              </p>
                              <InlineCategorySelector productId={product.id} categories={categories} />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {filteredInventory.length === 0 && (
                      <div className="py-10 text-center text-slate-400">
                        <Package size={24} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No products found</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ==================== ACCOUNTING TAB ==================== */}
              {activeTab === 'accounting' && (
                <div className="p-4 space-y-3">
                  {orders.length === 0 ? (
                    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm py-12 text-center">
                      <ClipboardList size={28} className="mx-auto mb-3 text-slate-300" />
                      <p className="text-sm font-medium text-slate-400">No orders yet</p>
                    </div>
                  ) : orders.map((order) => {
                    const isSupplement = order.is_supplement;
                    const isCancelled = order.status === 'cancelled';
                    const pt = order.payment_terms || 'COD';
                    return (
                      <div
                        key={order.id}
                        className={`bg-white rounded-xl border shadow-sm transition-all duration-150 hover:shadow-md overflow-hidden ${
                          isCancelled
                            ? 'border-red-100 opacity-60'
                            : isSupplement
                            ? 'border-amber-200'
                            : 'border-[#E2E8F0]'
                        }`}
                      >
                        {/* Color accent bar */}
                        <div className={`h-0.5 w-full ${isCancelled ? 'bg-red-300' : isSupplement ? 'bg-amber-500' : 'bg-slate-200'}`} />

                        <div className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0 pr-3">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h4 className="text-sm font-bold text-slate-900">{order.shop_name}</h4>
                                {isSupplement && (
                                  <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-[9px] font-bold px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
                                    SUPPLEMENT
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400">{order.phone} &middot; {order.address}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {new Date(order.timestamp).toLocaleString('en-ZA')} &middot; Del: {order.requested_delivery_date || 'TBD'} &middot; <span className="font-semibold text-slate-600">{pt}</span>
                              </p>
                              {isSupplement && order.parent_order_id && (
                                <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Parent: #{order.parent_order_id.slice(0, 8).toUpperCase()}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <div className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[order.status]}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[order.status]}`} />
                                {order.status.toUpperCase()}
                              </div>
                              <p className="text-base font-bold text-emerald-600 mt-2">{formatR(order.total_amount)}</p>
                              {order.delivery_fee > 0 && <p className="text-[10px] text-slate-400">+{formatR(order.delivery_fee)} del</p>}
                            </div>
                          </div>

                          {/* Order Lines */}
                          <div className="bg-slate-50 rounded-lg p-2.5 mb-3 space-y-1">
                            {order.order_data.map((item: OrderLineItem, idx: number) => (
                              <div key={idx} className="flex justify-between text-xs text-slate-600">
                                <span>{item.quantity}x {item.name}</span>
                                <span className="font-semibold text-slate-800">{formatR(item.lineTotal)}</span>
                              </div>
                            ))}
                          </div>

                          {order.order_notes && (
                            <p className="text-[11px] text-slate-500 mb-3 italic bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                              {order.order_notes}
                            </p>
                          )}

                          {/* Action Buttons */}
                          <div className="flex flex-wrap gap-1.5">
                            {order.status === 'pending' && (
                              <button
                                onClick={() => updateOrderStatus(order.id, 'captured')}
                                className="flex items-center gap-1 text-[11px] font-bold px-3 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.97] transition-all duration-150 shadow-sm min-h-[36px]"
                              >
                                <Check size={12} /> Capture
                              </button>
                            )}
                            {order.status === 'captured' && (
                              <button
                                onClick={() => updateOrderStatus(order.id, 'dispatched')}
                                className="flex items-center gap-1 text-[11px] font-bold px-3 py-2 rounded-lg bg-sky-500 text-white hover:bg-sky-600 active:scale-[0.97] transition-all duration-150 shadow-sm min-h-[36px]"
                              >
                                <Truck size={12} /> Dispatch
                              </button>
                            )}
                            {!isCancelled && (
                              <button
                                onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                className="flex items-center gap-1 text-[11px] font-bold px-3 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 active:scale-[0.97] transition-all duration-150 min-h-[36px]"
                              >
                                <X size={12} /> Cancel
                              </button>
                            )}
                            <button
                              onClick={() => copyOrderCode(order)}
                              className="flex items-center gap-1 text-[11px] font-semibold px-3 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-[0.97] transition-all duration-150 min-h-[36px]"
                            >
                              <Copy size={11} /> Code
                            </button>
                            <button
                              onClick={() => copyOrderQty(order)}
                              className="flex items-center gap-1 text-[11px] font-semibold px-3 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-[0.97] transition-all duration-150 min-h-[36px]"
                            >
                              <Copy size={11} /> Qty
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ==================== LOGISTICS TAB ==================== */}
              {activeTab === 'logistics' && (
                <div className="p-4 space-y-3">
                  {/* Date Selector */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                    <label className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2 block">Delivery Date</label>
                    <input
                      type="date"
                      value={logisticsDate}
                      onChange={(e) => { setLogisticsDate(e.target.value); setRoutingCalculated(false); }}
                      className="w-full px-3 py-2.5 bg-slate-50 rounded-lg text-sm border border-[#E2E8F0] focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none transition-all min-h-[44px]"
                    />
                  </div>

                  {/* Pending Orders Alert */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                    <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-3 flex items-center gap-2">
                      <AlertTriangle size={12} className="text-amber-500" />
                      Pending Capture ({pendingOrders.length})
                    </h3>
                    {pendingOrders.length === 0 ? (
                      <p className="text-xs text-slate-400">No pending orders for this date</p>
                    ) : pendingOrders.map((order) => (
                      <div key={order.id} className="flex items-center justify-between py-2.5 border-b border-[#E2E8F0] last:border-0">
                        <div>
                          <span className="text-sm font-semibold text-slate-900">{order.shop_name}</span>
                          <span className="text-xs text-slate-400 ml-2">{formatR(order.total_amount)}</span>
                          {order.is_supplement && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full ml-1.5 font-bold border border-amber-200">SUPP</span>}
                        </div>
                        <button
                          onClick={() => updateOrderStatus(order.id, 'captured')}
                          className="flex items-center gap-1 text-[11px] font-bold px-3 py-2 rounded-lg bg-amber-500 text-slate-900 hover:bg-amber-600 active:scale-[0.97] transition-all duration-150 shadow-sm min-h-[36px]"
                        >
                          <Check size={11} /> Capture
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Fleet Routing Engine */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider flex items-center gap-2">
                          <Truck size={12} className="text-slate-500" />
                          Fleet Routing
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">{capturedOrders.length} captured orders</p>
                      </div>
                      <button
                        onClick={calculateRouting}
                        disabled={capturedOrders.length === 0}
                        className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-slate-900 text-amber-400 hover:bg-slate-800 active:scale-[0.97] transition-all duration-150 shadow-sm disabled:opacity-40 min-h-[40px]"
                      >
                        <RefreshCw size={12} /> Optimize
                      </button>
                    </div>

                    {!routingCalculated ? (
                      <div className="text-center py-4 text-slate-400">
                        <Truck size={22} className="mx-auto mb-2 opacity-30" />
                        <p className="text-xs">Click Optimize to calculate vehicle assignments</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {FLEET.map((vehicle) => {
                          const alloc = vehicleAllocations[vehicle.id] || [];
                          const totalVal = alloc.reduce((s, o) => s + o.total_amount, 0);
                          const pct = Math.min((totalVal / vehicle.max_capacity_value) * 100, 100);
                          return (
                            <div key={vehicle.id} className="bg-slate-50 rounded-xl border border-[#E2E8F0] p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-900">{vehicle.name}</span>
                                <span className="text-[10px] text-slate-500">{alloc.length} stops &middot; {formatR(totalVal)}</span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2.5">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              {alloc.map((order, idx) => (
                                <div key={order.id} className="flex items-center justify-between text-[11px] py-1 border-b border-[#E2E8F0] last:border-0">
                                  <span className="text-slate-600">Stop {idx + 1}: {order.shop_name}</span>
                                  <span className="font-semibold text-slate-800">{formatR(order.total_amount)}</span>
                                </div>
                              ))}
                              {alloc.length === 0 && <p className="text-[10px] text-slate-400">No orders assigned</p>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Trip Sheet Button */}
                  <button
                    onClick={generateTripSheet}
                    disabled={!routingCalculated && Object.keys(vehicleAllocations).length === 0}
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 text-amber-400 font-bold text-sm py-4 rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all duration-150 shadow-md disabled:opacity-40 min-h-[52px]"
                  >
                    <FileText size={16} />
                    Print Trip Sheet & Dispatch via WhatsApp
                  </button>

                  {/* Completed Orders */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                    <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-3">Completed Orders</h3>
                    {logisticsOrders.filter((o) => o.status === 'dispatched' || o.status === 'delivered').map((order) => (
                      <div key={order.id} className="flex items-center justify-between py-2 border-b border-[#E2E8F0] last:border-0 text-xs">
                        <span className="text-slate-700 font-medium">{order.shop_name}</span>
                        <span className={`font-bold px-2.5 py-1 rounded-full text-[10px] ${STATUS_COLORS[order.status]}`}>{order.status.toUpperCase()}</span>
                      </div>
                    ))}
                    {logisticsOrders.filter((o) => o.status === 'dispatched' || o.status === 'delivered').length === 0 && (
                      <p className="text-xs text-slate-400">No completed orders for this date</p>
                    )}
                  </div>
                </div>
              )}

              {/* ==================== ANALYTICS TAB ==================== */}
              {activeTab === 'analytics' && (
                <div className="p-4 space-y-3">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider">Total Revenue</p>
                        <TrendingUp size={14} className="text-emerald-500" />
                      </div>
                      <p className="text-xl font-bold text-slate-900">{formatR(totalRevenue)}</p>
                      <p className="text-[10px] text-emerald-500 font-semibold mt-0.5">Dispatched + Delivered</p>
                    </div>
                    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider">In Pipeline</p>
                        <TrendingDown size={14} className="text-amber-500" />
                      </div>
                      <p className="text-xl font-bold text-slate-900">{formatR(pendingValue)}</p>
                      <p className="text-[10px] text-amber-500 font-semibold mt-0.5">Pending + Captured</p>
                    </div>
                  </div>

                  {/* Supply Alerts */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                    <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-3 flex items-center gap-2">
                      <AlertTriangle size={12} className="text-amber-500" />
                      Supply Loop Alerts
                      {supplyAlerts.length > 0 && (
                        <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-amber-200">{supplyAlerts.length}</span>
                      )}
                    </h3>
                    {supplyAlerts.length === 0 ? (
                      <p className="text-xs text-slate-400">No supply alerts</p>
                    ) : supplyAlerts.map((product) => (
                      <div key={product.id} className="py-3 border-b border-[#E2E8F0] last:border-0">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-slate-900">{product.name}</span>
                          <span className={`text-[9px] font-bold px-2 py-1 rounded-full ${
                            product.supply_alert_state === 'confirmed_oos' ? 'bg-red-50 text-red-600 border border-red-200' :
                            product.supply_alert_state === 'alert_20' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            'bg-amber-50 text-amber-600 border border-amber-100'
                          }`}>
                            {product.supply_alert_state.replace('_', ' ').toUpperCase()} ({product.days_unordered_counter}d)
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {product.supply_alert_state === 'alert_10' && (
                            <>
                              <button onClick={() => confirmSupplierOOS(product.id)} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 active:scale-[0.97] transition-all duration-150 min-h-[36px]">Confirm OOS</button>
                              <button onClick={() => forceReopenStock(product.id)} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 active:scale-[0.97] transition-all duration-150 min-h-[36px]">Reopen Stock</button>
                            </>
                          )}
                          {product.supply_alert_state === 'alert_20' && (
                            <>
                              <button onClick={() => ignoreUntilReopened(product.id)} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 border border-[#E2E8F0] active:scale-[0.97] transition-all duration-150 min-h-[36px]">Ignore Until Reopen</button>
                              <button onClick={() => resetLoop(product.id)} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 active:scale-[0.97] transition-all duration-150 min-h-[36px]">Reset Loop</button>
                            </>
                          )}
                          {product.supply_alert_state === 'confirmed_oos' && (
                            <button onClick={() => forceReopenStock(product.id)} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 active:scale-[0.97] transition-all duration-150 min-h-[36px]">Force Reopen</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Slow Movers */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                    <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Package size={12} className="text-slate-400" />
                      Slow Movers (14+ days)
                    </h3>
                    {slowMovers.length === 0 ? (
                      <p className="text-xs text-slate-400">No slow movers</p>
                    ) : slowMovers.map((product) => (
                      <div key={product.id} className="flex items-center justify-between py-2.5 border-b border-[#E2E8F0] last:border-0 text-xs">
                        <span className="text-slate-700 font-medium">{product.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-amber-600 font-bold">{product.days_unordered_counter}d</span>
                          {product.is_auto_discounted && <Flame size={10} className="text-emerald-500" />}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Order Status Breakdown */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                    <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-3">Order Breakdown</h3>
                    {(['pending', 'captured', 'dispatched', 'delivered', 'cancelled'] as OrderStatus[]).map((status) => {
                      const count = orders.filter((o) => o.status === status).length;
                      const value = orders.filter((o) => o.status === status).reduce((s, o) => s + o.total_amount, 0);
                      return (
                        <div key={status} className="flex items-center justify-between py-2.5 border-b border-[#E2E8F0] last:border-0 text-xs">
                          <span className={`font-bold px-2.5 py-1 rounded-full text-[10px] ${STATUS_COLORS[status]}`}>{status.toUpperCase()}</span>
                          <span className="text-slate-600">{count} orders &middot; {formatR(value)}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Broadcast Logs */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                    <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2 flex items-center gap-2">
                      <MessageCircle size={12} className="text-slate-400" />
                      Broadcast Logs
                    </h3>
                    <p className="text-xs text-slate-400">Marketing broadcasts will appear here when triggered via supply loop events.</p>
                  </div>
                </div>
              )}

              {/* ==================== SETTINGS TAB ==================== */}
              {activeTab === 'settings' && (
                <div className="p-4 space-y-3">
                  {/* PIN Management */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                    <h4 className="text-xs font-bold text-slate-900 mb-0.5">Admin PIN</h4>
                    <p className="text-[11px] text-slate-400 mb-3">Change the PIN required to access this dashboard.</p>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showNewPin ? 'text' : 'password'}
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="Enter new 4-6 digit PIN"
                          value={newPin}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                            setNewPin(val);
                            setPinSaved(false);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter' && /^\d{4,6}$/.test(newPin.trim())) handleSavePin(); }}
                          className="w-full px-3 py-2.5 bg-slate-50 border border-[#E2E8F0] rounded-xl text-sm font-mono tracking-[0.3em] focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none transition-all pr-10 min-h-[44px]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPin(!showNewPin)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                        >
                          {showNewPin ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      <button
                        onClick={handleSavePin}
                        disabled={!/^\d{4,6}$/.test(newPin.trim()) || savingPin}
                        className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 min-h-[44px] active:scale-[0.97] ${
                          !/^\d{4,6}$/.test(newPin.trim())
                            ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                            : pinSaved
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-500 text-slate-900 hover:bg-amber-600 shadow-sm'
                        }`}
                      >
                        {savingPin ? <span className="animate-pulse text-xs">Saving</span> : pinSaved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save</>}
                      </button>
                    </div>
                    {newPin.length > 0 && newPin.length < 4 && (
                      <p className="text-[11px] text-amber-500 mt-2">PIN must be at least 4 digits</p>
                    )}
                  </div>

                  {/* Cart Master Control */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                    <h4 className="text-xs font-bold text-slate-900 mb-0.5">Master Cart Control</h4>
                    <p className="text-[11px] text-slate-400 mb-4">Disable the customer ordering system globally.</p>
                    <button
                      onClick={() => updateSetting('cart_disabled', cartDisabled ? 'false' : 'true')}
                      className="flex items-center gap-3 group min-h-[44px]"
                    >
                      <div className={`relative w-12 h-6 rounded-full transition-all duration-300 ${cartDisabled ? 'bg-red-400' : 'bg-emerald-500'}`}>
                        <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${cartDisabled ? 'translate-x-0' : 'translate-x-6'}`} />
                      </div>
                      <div>
                        <span className={`text-sm font-bold ${cartDisabled ? 'text-red-600' : 'text-emerald-600'}`}>
                          Cart {cartDisabled ? 'DISABLED' : 'ENABLED'}
                        </span>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          {cartDisabled ? 'Customers cannot place orders' : 'Customers can browse and order'}
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Category Management */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-4">
                    <h4 className="text-xs font-bold text-slate-900 mb-0.5">Category Management</h4>
                    <p className="text-[11px] text-slate-400 mb-3">Add, reorder, or remove product categories.</p>
                    <CategoryManager categories={categories} />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CategoryManager({ categories }: { categories: Category[] }) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);

  const addCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    setAddingCategory(true);
    const maxOrder = Math.max(...categories.map((c) => c.display_order), 0);
    await supabase.from('categories').insert({ name: trimmed, display_order: maxOrder + 1 });
    setNewCategoryName('');
    setAddingCategory(false);
  };

  const moveCategory = async (categoryId: string, direction: 'up' | 'down') => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;
    if (direction === 'up' && category.display_order > 1) {
      const prevCategory = categories.find((c) => c.display_order === category.display_order - 1);
      if (prevCategory) {
        await supabase.from('categories').update({ display_order: prevCategory.display_order }).eq('id', categoryId);
        await supabase.from('categories').update({ display_order: category.display_order }).eq('id', prevCategory.id);
      }
    } else if (direction === 'down' && category.name !== 'ALL ITEMS') {
      const nextCategory = categories.filter((c) => c.name !== 'ALL ITEMS').find((c) => c.display_order === category.display_order + 1);
      if (nextCategory) {
        await supabase.from('categories').update({ display_order: nextCategory.display_order }).eq('id', categoryId);
        await supabase.from('categories').update({ display_order: category.display_order }).eq('id', nextCategory.id);
      }
    }
  };

  const deleteCategory = async (categoryId: string, categoryName: string) => {
    if (categoryName === 'ALL ITEMS') return;
    if (deletingCategory !== categoryId) { setDeletingCategory(categoryId); return; }
    await supabase.from('product_categories').delete().eq('category_id', categoryId);
    await supabase.from('categories').delete().eq('id', categoryId);
    setDeletingCategory(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="New category name"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }}
          className="flex-1 px-3 py-2.5 bg-slate-50 rounded-xl text-sm border border-[#E2E8F0] focus:border-amber-400 focus:ring-1 focus:ring-amber-100 outline-none transition-all min-h-[44px]"
        />
        <button
          onClick={addCategory}
          disabled={addingCategory || !newCategoryName.trim()}
          className="px-4 py-2.5 bg-amber-500 text-slate-900 font-bold text-sm rounded-xl hover:bg-amber-600 active:scale-[0.97] disabled:opacity-40 min-h-[44px] flex items-center gap-1.5 transition-all duration-150 shadow-sm"
        >
          <Plus size={14} /> Add
        </button>
      </div>
      <div className="space-y-1.5">
        {categories.map((category) => (
          <div key={category.id} className="bg-slate-50 rounded-xl border border-[#E2E8F0] px-3 py-2.5 flex items-center justify-between transition-all duration-150 hover:shadow-sm">
            <span className="font-semibold text-slate-800 text-sm">{category.name}</span>
            {category.name !== 'ALL ITEMS' && (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => moveCategory(category.id, 'up')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-all duration-150 min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  onClick={() => moveCategory(category.id, 'down')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-all duration-150 min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  <ChevronDown size={15} />
                </button>
                <button
                  onClick={() => deleteCategory(category.id, category.name)}
                  className={`p-1.5 rounded-lg transition-all duration-150 min-w-[36px] min-h-[36px] flex items-center justify-center ${
                    deletingCategory === category.id
                      ? 'bg-red-500 text-white scale-95'
                      : 'text-red-400 hover:text-red-600 hover:bg-red-50'
                  }`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function InlineCategorySelector({ productId, categories }: { productId: string; categories: Category[] }) {
  const [assigned, setAssigned] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('product_categories').select('category_id').eq('product_id', productId).then(({ data }) => {
      setAssigned(data ? data.map((r) => r.category_id) : []);
      setLoading(false);
    });
  }, [productId]);

  const toggle = async (categoryId: string) => {
    const isAssigned = assigned.includes(categoryId);
    if (isAssigned) {
      await supabase.from('product_categories').delete().eq('product_id', productId).eq('category_id', categoryId);
      setAssigned((prev) => prev.filter((id) => id !== categoryId));
    } else {
      const maxOrder = assigned.length;
      await supabase.from('product_categories').insert({ product_id: productId, category_id: categoryId, display_order_within_category: maxOrder + 1 });
      setAssigned((prev) => [...prev, categoryId]);
    }
  };

  const nonAll = categories.filter((c) => c.name !== 'ALL ITEMS');

  if (loading) return <p className="text-[9px] text-slate-400 animate-pulse">Loading...</p>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {nonAll.map((cat) => {
        const active = assigned.includes(cat.id);
        return (
          <button
            key={cat.id}
            onClick={() => toggle(cat.id)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all duration-150 active:scale-95 ${
              active
                ? 'bg-amber-500 text-slate-900 shadow-sm'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-[#E2E8F0]'
            }`}
          >
            {active && <Check size={8} className="inline mr-0.5" />}{cat.name}
          </button>
        );
      })}
      {nonAll.length === 0 && <p className="text-[9px] text-slate-400">No custom categories yet. Create them in Settings.</p>}
    </div>
  );
}
