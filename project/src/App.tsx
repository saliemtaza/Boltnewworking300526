import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { CategoryTabs } from './components/CategoryTabs';
import { ProductGrid } from './components/ProductGrid';
import { ProductModal } from './components/ProductModal';
import { CartDrawer } from './components/CartDrawer';
import { AdminPanel } from './components/AdminPanel';
import { useProducts } from './hooks/useProducts';
import { useCategories } from './hooks/useCategories';
import { useCart } from './hooks/useCart';
import { useSettings } from './hooks/useSettings';
import {
  Product, Category, DeliveryResult, supabase, getFavorites, toggleFavorite, getSupplementAnchor,
  lsGet, LS
} from './lib/supabase';
import {
  cacheProducts, cacheCategories,
  processSyncQueue, onNetworkChange, isOnline as checkOnline
} from './lib/offline';
import { ShoppingCart, WifiOff } from 'lucide-react';

export default function App() {
  const { products, setProducts, visibleProducts, specials, loading: productsLoading } = useProducts();
  const { categories, loading: categoriesLoading } = useCategories();
  const cart = useCart();
  const { cartDisabled } = useSettings();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(getFavorites());
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);
  const [loadingCategoryProducts, setLoadingCategoryProducts] = useState(false);
  const [online, setOnline] = useState(checkOnline());
  const [deliveryZoneResult, setDeliveryZoneResult] = useState<DeliveryResult | null>(null);

  // Network monitor
  useEffect(() => {
    const unsub = onNetworkChange((isOnline) => {
      setOnline(isOnline);
      if (isOnline) {
        // Process sync queue when back online
        processSyncQueue();
      }
    });
    return unsub;
  }, []);

  // Cache products and categories to IndexedDB when loaded
  useEffect(() => {
    if (products.length > 0) cacheProducts(products);
  }, [products]);

  useEffect(() => {
    if (categories.length > 0) cacheCategories(categories);
  }, [categories]);

  // Set default category to ALL ITEMS on load
  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      const allItems = categories.find((c) => c.name === 'ALL ITEMS');
      setSelectedCategory(allItems || categories[0]);
    }
  }, [categories, selectedCategory]);

  // Filter products by category or favorites
  const fetchCategoryProducts = useCallback(async () => {
    if (showFavorites) {
      setCategoryProducts(visibleProducts.filter((p) => favorites.includes(p.id)));
      setLoadingCategoryProducts(false);
      return;
    }
    if (!selectedCategory) return;

    setLoadingCategoryProducts(true);
    if (selectedCategory.name === 'ALL ITEMS') {
      setCategoryProducts(visibleProducts);
    } else {
      if (online) {
        const { data } = await supabase
          .from('product_categories')
          .select('product_id')
          .eq('category_id', selectedCategory.id)
          .order('display_order_within_category');

        if (data) {
          const productIds = data.map((pc) => pc.product_id);
          const filtered = visibleProducts.filter((p) => productIds.includes(p.id));
          setCategoryProducts(filtered);
        }
      } else {
        // Offline fallback: show all visible products
        setCategoryProducts(visibleProducts);
      }
    }
    setLoadingCategoryProducts(false);
  }, [selectedCategory, visibleProducts, showFavorites, favorites, online]);

  useEffect(() => {
    fetchCategoryProducts();
  }, [fetchCategoryProducts]);

  const handleAddToCart = (product: Product, quantity = 1) => {
    if (!product.is_in_stock || cartDisabled) return;
    cart.addItem(product, quantity);
    setSelectedProduct(null);
    setCartOpen(true);
    setTimeout(() => setCartOpen(false), 1200);
  };

  const handleToggleFavorite = (productId: string) => {
    const next = toggleFavorite(productId);
    setFavorites(next);
  };

  const handleSupplementClick = () => {
    setCartOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header
        cartCount={cart.totalItems}
        cartTotal={cart.totalPrice}
        minOrder={deliveryZoneResult?.minOrder ?? 1800}
        deliveryZone={deliveryZoneResult?.zone ?? 'zone1'}
        freeDelivery={deliveryZoneResult?.freeDelivery ?? false}
        deliveryAllowed={deliveryZoneResult?.allowed ?? null}
        onCartClick={() => setCartOpen(true)}
        onAdminClick={() => setAdminOpen(true)}
        onSupplementClick={handleSupplementClick}
      />

      {/* Offline Banner */}
      {!online && (
        <div className="bg-red-600 text-white text-center py-1.5 px-4 text-xs font-semibold flex items-center justify-center gap-2">
          <WifiOff size={12} />
          Offline Mode - Cart & checkout work locally, WhatsApp queues on device
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 py-4 flex-1 w-full">
        {/* Welcome Back HUD */}
        {lsGet(LS.SHOP_NAME) && !getSupplementAnchor() && (
          <div className="mb-3 bg-white rounded-lg p-3 shadow-sm border border-slate-100">
            <p className="text-sm text-slate-600">
              Welcome back, <span className="font-bold text-slate-900">{lsGet(LS.SHOP_NAME)}</span>! Ready for your weekly replenishment?
            </p>
          </div>
        )}

        {/* Specials Banner */}
        {specials.length > 0 && !showFavorites && (
          <div className="mb-3 bg-gradient-to-r from-amber-50 to-emerald-50 rounded-lg p-3 shadow-sm border border-amber-200">
            <p className="text-xs font-bold text-amber-700 mb-1">SPECIALS - Auto-Discounted Items</p>
            <div className="flex gap-2 overflow-x-auto">
              {specials.slice(0, 5).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className="shrink-0 bg-white rounded-lg p-2 shadow-sm border border-amber-100 hover:border-amber-300 transition-all"
                >
                  <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded object-cover" />
                  <p className="text-[10px] text-slate-900 font-semibold mt-1 max-w-[60px] truncate">{p.name}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Category Tabs */}
        {!categoriesLoading && categories.length > 0 && (
          <CategoryTabs
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={(cat) => { setSelectedCategory(cat); setShowFavorites(false); }}
            favoritesCount={favorites.length}
            showFavorites={showFavorites}
            onToggleFavorites={() => setShowFavorites(!showFavorites)}
          />
        )}

        {/* Product Grid */}
        <ProductGrid
          products={categoryProducts}
          loading={productsLoading || loadingCategoryProducts}
          cartItems={cart.items}
          onProductClick={setSelectedProduct}
          onAddToCart={handleAddToCart}
          onUpdateQuantity={cart.updateQuantity}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
        />
      </main>

      {/* Product Modal */}
      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={(product, quantity) => handleAddToCart(product, quantity)}
        isFavorite={selectedProduct ? favorites.includes(selectedProduct.id) : false}
        onToggleFavorite={handleToggleFavorite}
      />

      {/* Cart Drawer */}
      <CartDrawer
        items={cart.items}
        onUpdateQuantity={cart.updateQuantity}
        onRemoveItem={cart.removeItem}
        onClearCart={cart.clearCart}
        onClose={() => setCartOpen(false)}
        isOpen={cartOpen}
        cartDisabled={cartDisabled}
        totalPrice={cart.totalPrice}
        totalSavings={cart.totalSavings}
        online={online}
        onDeliveryZoneChange={setDeliveryZoneResult}
      />

      {/* Admin Panel */}
      <AdminPanel
        products={products}
        setProducts={setProducts}
        categories={categories}
        isOpen={adminOpen}
        onClose={() => setAdminOpen(false)}
      />

      {/* Floating Cart Button */}
      {cart.totalItems > 0 && !cartOpen && !adminOpen && !selectedProduct && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-16 right-5 bg-amber-500 text-slate-900 rounded-full px-5 py-3 shadow-lg hover:bg-amber-600 active:scale-95 transition-all flex items-center gap-2 z-30 animate-scale-in font-semibold"
        >
          <ShoppingCart size={18} />
          <span className="text-sm">{cart.totalItems} items</span>
          <span className="bg-white text-amber-700 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
            {cart.totalItems}
          </span>
        </button>
      )}

      {/* VAT Footer - Permanent Sticky */}
      <footer className="sticky bottom-0 bg-slate-900 text-slate-400 text-center py-2 px-4 text-[11px] z-30 border-t border-slate-700">
        All prices are inclusive of VAT where applicable.
      </footer>
    </div>
  );
}
