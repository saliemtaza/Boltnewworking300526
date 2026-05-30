import { useState, useCallback } from 'react';
import { Product, CartItem, lsGet, lsSet, lsRemove, LS } from '../lib/supabase';

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((product: Product, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + qty } : i
        );
      }
      return [...prev, { product, quantity: qty }];
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.product.id !== productId));
    } else {
      setItems((prev) =>
        prev.map((i) =>
          i.product.id === productId ? { ...i, quantity } : i
        )
      );
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const totalPrice = items.reduce(
    (sum, i) => sum + (i.product.sale_price ?? i.product.price) * i.quantity,
    0
  );
  const totalSavings = subtotal - totalPrice;

  return { items, addItem, removeItem, updateQuantity, clearCart, totalItems, subtotal, totalPrice, totalSavings };
}

// Persisted customer info hook
export function useCustomerInfo() {
  const get = (key: string) => lsGet(key) || '';
  const set = (key: string, val: string) => {
    if (val) lsSet(key, val);
    else lsRemove(key);
  };
  return {
    shopName: get(LS.SHOP_NAME),
    phone: get(LS.PHONE),
    address: get(LS.ADDRESS),
    setShopName: (v: string) => set(LS.SHOP_NAME, v),
    setPhone: (v: string) => set(LS.PHONE, v),
    setAddress: (v: string) => set(LS.ADDRESS, v),
  };
}
