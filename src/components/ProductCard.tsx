import { Minus, Plus, Star, Flame, AlertTriangle } from 'lucide-react';
import { Product, formatR } from '../lib/supabase';

interface ProductCardProps {
  product: Product;
  cartQuantity: number;
  onAddToCart: (product: Product) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onClick: (product: Product) => void;
  favorites: string[];
  onToggleFavorite: (productId: string) => void;
}

export function ProductCard({
  product, cartQuantity, onAddToCart, onUpdateQuantity, onClick, favorites, onToggleFavorite,
}: ProductCardProps) {
  const isFav = favorites.includes(product.id);
  const hasSale = product.sale_price !== null && product.sale_price < product.price;
  const qty = cartQuantity;

  return (
    <div className="relative bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 transition-all duration-150 ease-in-out hover:shadow-md">
      {product.is_auto_discounted && (
        <div className="absolute top-2 left-2 z-10 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-1">
          <Flame size={10} /> Special
        </div>
      )}
      {product.is_low_stock && product.is_in_stock && (
        <div className="absolute top-2 right-10 z-10 bg-amber-500 text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
          <AlertTriangle size={10} /> Low
        </div>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(product.id); }}
        className={`absolute top-2 right-2 z-10 p-1 rounded-full transition-all duration-150 ${isFav ? 'text-amber-400 scale-110' : 'text-slate-300 hover:text-amber-400'}`}
      >
        <Star size={16} fill={isFav ? 'currentColor' : 'none'} />
      </button>

      <div className="cursor-pointer aspect-square overflow-hidden bg-slate-50" onClick={() => onClick(product)}>
        <img
          src={product.image_url}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
          loading="lazy"
        />
      </div>

      <div className="p-3">
        <h3
          className="font-semibold text-sm text-slate-900 leading-tight cursor-pointer hover:text-amber-600 transition-colors duration-150 line-clamp-2"
          onClick={() => onClick(product)}
        >
          {product.name}
          {product.variant_label && (
            <span className="text-slate-400 font-normal ml-1">({product.variant_label})</span>
          )}
        </h3>

        <div className="flex items-center justify-between mt-2 gap-2">
          <div className="flex flex-col gap-0.5 shrink-0">
            {hasSale ? (
              <>
                <span className="text-slate-400 font-medium text-xs line-through">{formatR(product.price)}</span>
                <span className="text-emerald-500 font-bold text-sm flex items-center gap-0.5">
                  <Flame size={11} />{formatR(product.sale_price!)}
                </span>
              </>
            ) : (
              <span className="text-emerald-500 font-bold text-sm">{formatR(product.price)}</span>
            )}
          </div>

          {qty === 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); onAddToCart(product); }}
              className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-full bg-amber-500 text-slate-900 hover:bg-amber-600 active:scale-95 transition-all duration-150 shadow-sm whitespace-nowrap"
            >
              <Plus size={13} /> Add
            </button>
          ) : (
            <div className="flex items-center bg-amber-500 rounded-full shadow-sm overflow-hidden">
              <button
                onClick={(e) => { e.stopPropagation(); onUpdateQuantity(product.id, qty - 1); }}
                className="px-2.5 py-2 text-slate-900 hover:bg-amber-600 active:scale-95 transition-all duration-150 font-bold flex items-center"
              >
                <Minus size={12} />
              </button>
              <span className="px-1.5 text-sm font-bold text-slate-900 min-w-[20px] text-center select-none">{qty}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onUpdateQuantity(product.id, qty + 1); }}
                className="px-2.5 py-2 text-slate-900 hover:bg-amber-600 active:scale-95 transition-all duration-150 font-bold flex items-center"
              >
                <Plus size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
