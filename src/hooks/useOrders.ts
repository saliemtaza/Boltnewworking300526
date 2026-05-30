import { useEffect, useState, useCallback } from 'react';
import { supabase, OrderLog, OrderStatus } from '../lib/supabase';

export function useOrders() {
  const [orders, setOrders] = useState<OrderLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders_log' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setOrders((prev) => [payload.new as OrderLog, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setOrders((prev) => prev.map((o) => (o.id === (payload.new as OrderLog).id ? (payload.new as OrderLog) : o)));
        } else if (payload.eventType === 'DELETE') {
          setOrders((prev) => prev.filter((o) => o.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('orders_log').select('*').order('timestamp', { ascending: false });
    if (data) setOrders(data);
    setLoading(false);
  }, []);

  const updateOrderStatus = useCallback(async (orderId: string, status: OrderStatus) => {
    const { error } = await supabase.from('orders_log').update({ status }).eq('id', orderId);
    if (error) console.error('Status update error:', error);
  }, []);

  const assignVehicle = useCallback(async (orderId: string, vehicleId: string, seqIndex: number) => {
    const { error } = await supabase
      .from('orders_log')
      .update({ assigned_vehicle_id: vehicleId, routing_sequence_index: seqIndex })
      .eq('id', orderId);
    if (error) console.error('Vehicle assign error:', error);
  }, []);

  return { orders, loading, refetch: fetchOrders, updateOrderStatus, assignVehicle };
}
