import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const WAREHOUSE_LAT = -26.2295;
const WAREHOUSE_LNG = 28.0689;

const FREIGHT_MATRIX = {
  zone1: { minKm: 0, maxKm: 35, minOrder: 1800, deliveryFee: 0 },
  zone2: { minKm: 35, maxKm: 55, minOrder: 2000, deliveryFee: 0 },
  zone3: { minKm: 55, maxKm: 60, minOrder: 2000, feePer5km: 50 },
  highValueThreshold: 5000,
  freeDeliveryMaxKm: 60,
  maxDeliveryKm: 60,
};

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateDelivery(distanceKm: number, orderTotal: number) {
  const fm = FREIGHT_MATRIX;

  if (distanceKm > fm.maxDeliveryKm) {
    return {
      allowed: false,
      zone: "beyond",
      distance: distanceKm,
      minOrder: Infinity,
      deliveryFee: 0,
      freeDelivery: false,
      reason: "Delivery not available beyond 60km",
    };
  }

  const isHighValue = orderTotal >= fm.highValueThreshold;

  if (isHighValue && distanceKm <= fm.freeDeliveryMaxKm) {
    return {
      allowed: true,
      zone: distanceKm <= 35 ? "zone1" : distanceKm <= 55 ? "zone2" : "zone3",
      distance: distanceKm,
      minOrder: 0,
      deliveryFee: 0,
      freeDelivery: true,
      reason: `High-value order (R${orderTotal.toFixed(2)}) - Free delivery up to 60km`,
    };
  }

  if (distanceKm <= fm.zone1.maxKm) {
    const meetsMin = orderTotal >= fm.zone1.minOrder;
    return {
      allowed: meetsMin,
      zone: "zone1",
      distance: distanceKm,
      minOrder: fm.zone1.minOrder,
      deliveryFee: 0,
      freeDelivery: false,
      reason: meetsMin
        ? `Zone 1 (0-35km) - Minimum R${fm.zone1.minOrder} met`
        : `Zone 1 minimum order is R${fm.zone1.minOrder}. Current total: R${orderTotal.toFixed(2)}`,
    };
  }

  if (distanceKm <= fm.zone2.maxKm) {
    const meetsMin = orderTotal >= fm.zone2.minOrder;
    return {
      allowed: meetsMin,
      zone: "zone2",
      distance: distanceKm,
      minOrder: fm.zone2.minOrder,
      deliveryFee: 0,
      freeDelivery: false,
      reason: meetsMin
        ? `Zone 2 (35-55km) - Minimum R${fm.zone2.minOrder} met`
        : `Zone 2 minimum order is R${fm.zone2.minOrder}. Current total: R${orderTotal.toFixed(2)}`,
    };
  }

  if (distanceKm <= fm.zone3.maxKm) {
    const meetsMin = orderTotal >= fm.zone3.minOrder;
    const blocksOver55 = Math.ceil((distanceKm - 55) / 5);
    const extraFee = blocksOver55 * fm.zone3.feePer5km;
    return {
      allowed: meetsMin,
      zone: "zone3",
      distance: distanceKm,
      minOrder: fm.zone3.minOrder,
      deliveryFee: extraFee,
      freeDelivery: false,
      reason: meetsMin
        ? `Zone 3 (55-60km) - R${extraFee} delivery fee applies`
        : `Zone 3 minimum order is R${fm.zone3.minOrder}. Delivery fee: R${extraFee}`,
    };
  }

  return {
    allowed: false,
    zone: "beyond",
    distance: distanceKm,
    minOrder: Infinity,
    deliveryFee: 0,
    freeDelivery: false,
    reason: "Delivery not available beyond 60km",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { lat, lng, orderTotal } = await req.json();

    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(JSON.stringify({ error: "lat and lng required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const total = typeof orderTotal === "number" ? orderTotal : 0;
    const distance = haversineDistance(WAREHOUSE_LAT, WAREHOUSE_LNG, lat, lng);
    const result = calculateDelivery(distance, total);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
