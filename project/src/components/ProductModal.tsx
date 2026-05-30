import { X, Minus, Plus, ShoppingCart, Star, Flame } from 'lucide-react';
import { Product, formatR } from '../lib/supabase';
import { useState } from 'react';

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
  isFavorite: boolean;
  onToggleFavorite: (productId: string) => void;
}

export function ProductModal({ product, onClose, onAddToCart, isFavorite, onToggleFavorite }: ProductModalProps) {
  const [quantity, setQuantity] = useState(1);

  if (!product) return null;

  const hasSale = product.sale_price !== null && product.sale_price < product.price;

  const handleAdd = () => {
    onAddToCart(product, quantity);
    setQuantity(1);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden animate-slide-up shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <div className="aspect-[4/3] overflow-hidden bg-slate-50">
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-md hover:bg-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X size={18} className="text-slate-700" />
          </button>
          <button
            onClick={() => onToggleFavorite(product.id)}
            className={`absolute top-3 right-14 rounded-full p-2 shadow-md transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${isFavorite ? 'bg-amber-400 text-slate-900' : 'bg-white/90 text-slate-400 hover:text-amber-400'}`}
          >
            <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          {product.is_auto_discounted && (
            <div className="absolute top-3 left-3 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
              <Flame size={12} /> Special
            </div>
          )}
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{product.name}</h2>
              {product.variant_label && (
                <span className="text-slate-400 text-sm">{product.variant_label}</span>
              )}
            </div>
            <div className="ml-3 shrink-0 flex flex-col gap-0.5 text-right">
              {hasSale ? (
                <>
                  <span className="text-slate-400 font-medium text-sm line-through">
                    {formatR(product.price)}
                  </span>
                  <span className="text-emerald-500 font-bold text-xl flex items-center gap-1 justify-end">
                    <Flame size={14} />
                    {formatR(product.sale_price!)}
                  </span>
                </>
              ) : (
                <span className="text-emerald-500 font-bold text-xl">
                  {formatR(product.price)}
                </span>
              )}
            </div>
          </div>
          <p className="text-slate-500 text-sm leading-relaxed mb-5">
            {product.description}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 bg-slate-50 rounded-full px-1 py-1">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center hover:bg-slate-100 transition-colors min-w-[44px] min-h-[44px]"
              >
                <Minus size={14} />
              </button>
              <span className="w-8 text-center font-semibold text-sm">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center hover:bg-slate-100 transition-colors min-w-[44px] min-h-[44px]"
              >
                <Plus size={14} />
              </button>
            </div>
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 bg-amber-500 text-slate-900 font-semibold px-5 py-2.5 rounded-full hover:bg-amber-600 active:scale-95 transition-all shadow-sm min-h-[44px]"
            >
              <ShoppingCart size={16} />
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
