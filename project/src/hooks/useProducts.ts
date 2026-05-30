import { useEffect, useState, useMemo } from 'react';
import { supabase, Product } from '../lib/supabase';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();

    const channel = supabase
      .channel('products-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setProducts((prev) => prev.map((p) => (p.id === (payload.new as Product).id ? (payload.new as Product) : p)));
        } else if (payload.eventType === 'INSERT') {
          setProducts((prev) => [...prev, payload.new as Product]);
        } else if (payload.eventType === 'DELETE') {
          setProducts((prev) => prev.filter((p) => p.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data } = await supabase.from('products').select('*').order('created_at', { ascending: true });
    if (data) setProducts(data);
    setLoading(false);
  }

  // Group-locked rotation: sort by maximum last_promoted_at across variant bundles
  const sortedProducts = useMemo(() => {
    const groups = new Map<string, Product[]>();
    const standalone: Product[] = [];

    for (const p of products) {
      if (p.parent_id) {
        const arr = groups.get(p.parent_id) || [];
        arr.push(p);
        groups.set(p.parent_id, arr);
      } else {
        const children = products.filter((c) => c.parent_id === p.id);
        if (children.length > 0) {
          groups.set(p.id, [p, ...children]);
        } else {
          standalone.push(p);
        }
      }
    }

    const sortedGroups = [...groups.values()].sort((a, b) => {
      const maxA = Math.max(...a.map((p) => new Date(p.last_promoted_at).getTime()));
      const maxB = Math.max(...b.map((p) => new Date(p.last_promoted_at).getTime()));
      return maxA - maxB;
    });

    const sortedStandalone = standalone.sort((a, b) =>
      new Date(a.last_promoted_at).getTime() - new Date(b.last_promoted_at).getTime()
    );

    const result: Product[] = [];
    for (const group of sortedGroups) {
      result.push(...group);
    }
    result.push(...sortedStandalone);
    return result;
  }, [products]);

  // Visible products for storefront: hide out-of-stock variants;
  // if ALL variants in a group are OOS, hide the entire master card
  const visibleProducts = useMemo(() => {
    const masterIds = new Set<string>();
    const variantGroups = new Map<string, Product[]>();

    for (const p of sortedProducts) {
      if (p.parent_id) {
        const arr = variantGroups.get(p.parent_id) || [];
        arr.push(p);
        variantGroups.set(p.parent_id, arr);
      } else if (sortedProducts.some((c) => c.parent_id === p.id)) {
        masterIds.add(p.id);
        const arr = variantGroups.get(p.id) || [];
        variantGroups.set(p.id, [p, ...arr]);
      }
    }

    const result: Product[] = [];

    for (const [, group] of variantGroups) {
      const inStock = group.filter((p) => p.is_in_stock);
      if (inStock.length === 0) continue; // hide entire group
      result.push(...inStock);
    }

    // Add standalone products that are in stock
    for (const p of sortedProducts) {
      if (!p.parent_id && !masterIds.has(p.id) && p.is_in_stock) {
        result.push(p);
      }
    }

    return result;
  }, [sortedProducts]);

  // Auto-discounted products (specials)
  const specials = useMemo(() => products.filter((p) => p.is_auto_discounted && p.is_in_stock), [products]);

  return { products, setProducts, sortedProducts, visibleProducts, specials, loading, refetch: fetchProducts };
}
