import { ShoppingCart, Shield, Star } from 'lucide-react';
import { lsGet, LS, getSupplementAnchor, formatR } from '../lib/supabase';

interface HeaderProps {
  cartCount: number;
  cartTotal: number;
  minOrder: number;
  deliveryZone: string;
  freeDelivery: boolean;
  deliveryAllowed: boolean | null;
  onCartClick: () => void;
  onAdminClick: () => void;
  onSupplementClick: () => void;
}

const ZONE_LABELS: Record<string, string> = {
  zone1: 'Zone 1 (0-35km)',
  zone2: 'Zone 2 (35-55km)',
  zone3: 'Zone 3 (55-60km)',
  beyond: 'Beyond delivery range',
};

export function Header({ cartCount, cartTotal, minOrder, deliveryZone, freeDelivery, deliveryAllowed, onCartClick, onAdminClick, onSupplementClick }: HeaderProps) {
  const shopName = lsGet(LS.SHOP_NAME);
  const supplement = getSupplementAnchor();
  const progress = minOrder > 0 ? Math.min((cartTotal / minOrder) * 100, 100) : (cartTotal > 0 ? 100 : 0);
  const thresholdMet = cartTotal >= minOrder || freeDelivery;

  const zoneLabel = ZONE_LABELS[deliveryZone] ?? '';
  const isGeocoded = deliveryAllowed !== null;

  let hudText: string;
  if (freeDelivery) {
    hudText = `FREE DELIVERY UNLOCKED${zoneLabel ? ` · ${zoneLabel}` : ''}`;
  } else if (deliveryZone === 'beyond') {
    hudText = 'Beyond delivery range (60km cap)';
  } else if (isGeocoded) {
    hudText = `${formatR(cartTotal)} / ${formatR(minOrder)} · ${zoneLabel}`;
  } else {
    hudText = `${formatR(cartTotal)} / ${formatR(minOrder)} minimum · Enter address to detect zone`;
  }

  const barColor = deliveryZone === 'beyond'
    ? 'bg-red-500'
    : thresholdMet
      ? 'bg-emerald-500'
      : 'bg-amber-500';

  return (
    <>
      {/* Supplement Banner */}
      {supplement && (
        <div
          onClick={onSupplementClick}
          className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-slate-900 text-center py-2 px-4 text-sm font-bold cursor-pointer animate-pulse shadow-md"
        >
          ORDER SUPPLEMENT MODE ACTIVE - Click to add items to Order #{supplement.orderId.slice(0, 8).toUpperCase()}
        </div>
      )}

      <header className={`sticky ${supplement ? 'top-10' : 'top-0'} z-40 bg-slate-900/95 backdrop-blur-md shadow-md`}>
        <div className="max-w-lg mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo_white.jpg" alt="Taza Direct" className="h-[45px] object-contain" />
          </div>
          <div className="flex items-center gap-2">
            {shopName && !supplement && (
              <span className="text-slate-300 text-xs hidden sm:block">Welcome back, {shopName}!</span>
            )}
            <button
              onClick={onAdminClick}
              className="p-2.5 text-slate-400 hover:text-amber-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Admin"
            >
              <Shield size={20} />
            </button>
            <button
              onClick={onCartClick}
              className="relative p-2.5 text-slate-300 hover:text-amber-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Cart"
            >
              <ShoppingCart size={22} />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-slate-900 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center animate-scale-in">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Cart Progress HUD */}
        {cartCount > 0 && (
          <div className="max-w-lg mx-auto px-4 pb-2">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className={`${deliveryZone === 'beyond' ? 'text-red-400' : freeDelivery ? 'text-emerald-400' : 'text-slate-400'}`}>
                {hudText}
              </span>
              {thresholdMet && deliveryZone !== 'beyond' && <Star size={12} className="text-amber-400" />}
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
                style={{ width: `${deliveryZone === 'beyond' ? 100 : progress}%` }}
              />
            </div>
          </div>
        )}
      </header>
    </>
  );
}
