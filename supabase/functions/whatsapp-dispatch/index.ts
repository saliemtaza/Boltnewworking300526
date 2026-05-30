import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OWNER_NUMBER = "27645585247";
const ADMIN_NUMBER = "27834136934";
const STOCK_CONTROLLER_NUMBER = "27840633921";
const WHATSAPP_API_URL = "https://api.whatsapp.com/send";

interface DispatchPayload {
  type: "order" | "supplement" | "supply_alert" | "broadcast" | "trip_sheet";
  target: "owner" | "admin" | "stock_controller" | "all";
  message: string;
  pdfUrl?: string;
}

function getTargetNumber(target: string): string {
  switch (target) {
    case "owner": return OWNER_NUMBER;
    case "admin": return ADMIN_NUMBER;
    case "stock_controller": return STOCK_CONTROLLER_NUMBER;
    default: return OWNER_NUMBER;
  }
}

function buildWhatsAppUrl(phone: string, message: string): string {
  return `${WHATSAPP_API_URL}?phone=${phone}&text=${encodeURIComponent(message)}`;
}

function buildMultiTargetUrls(targets: string[], message: string): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const t of targets) {
    urls[t] = buildWhatsAppUrl(t, message);
  }
  return urls;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload: DispatchPayload = await req.json();
    const { type, target, message, pdfUrl } = payload;

    let targetNumbers: string[] = [];

    if (target === "all") {
      targetNumbers = [OWNER_NUMBER, ADMIN_NUMBER, STOCK_CONTROLLER_NUMBER];
    } else {
      targetNumbers = [getTargetNumber(target)];
    }

    const urls = buildMultiTargetUrls(targetNumbers, message);

    const data = {
      success: true,
      type,
      dispatchUrls: urls,
      targetNumbers,
      message,
      pdfUrl: pdfUrl || null,
    };

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMsg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
