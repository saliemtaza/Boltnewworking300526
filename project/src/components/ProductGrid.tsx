import { useState, useMemo } from 'react';
import { Product, CartItem } from '../lib/supabase';
import { ProductCard } from './ProductCard';
import { Search } from 'lucide-react';

interface ProductGridProps {
  products: Product[];
  loading: boolean;
  cartItems: CartItem[];
  onProductClick: (product: Product) => void;
  onAddToCart: (product: Product, quantity?: number) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  favorites: string[];
  onToggleFavorite: (productId: string) => void;
}

export function ProductGrid({
  products, loading, cartItems, onProductClick, onAddToCart, onUpdateQuantity, favorites, onToggleFavorite,
}: ProductGridProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.variant_label.toLowerCase().includes(q)
    );
  }, [products, search]);

  const cartMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const item of cartItems) m[item.product.id] = item.quantity;
    return m;
  }, [cartItems]);

  if (loading) {
    return (
      <>
        <div className="mb-4"><div className="bg-slate-200 h-10 rounded-lg animate-pulse" /></div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-slate-200 rounded-xl aspect-square" />
              <div className="mt-2 bg-slate-200 h-4 rounded w-3/4" />
              <div className="mt-1 bg-slate-200 h-4 rounded w-1/2" />
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-4 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 bg-white rounded-lg text-sm border border-slate-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition-all shadow-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center">
          <p className="text-sm font-medium">No products found</p>
          <p className="text-xs mt-1">Try a different search or category</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              cartQuantity={cartMap[product.id] ?? 0}
              onAddToCart={onAddToCart}
              onUpdateQuantity={onUpdateQuantity}
              onClick={onProductClick}
              favorites={favorites}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
    </>
  );
}
