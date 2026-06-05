import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { verifyAgentSecret } from "./agent";

const http = httpRouter();

// Helper to construct JSON CORS responses
const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-ElevenLabs-Secret, Authorization"
    }
  });
};

// Handle CORS Preflight OPTIONS requests
http.route({
  path: "/api/agent/session",
  method: "OPTIONS",
  handler: httpAction(async (ctx, request) => {
    return jsonResponse({}, 200);
  })
});

// POST /api/agent/session
// Requests signed URLs
http.route({
  path: "/api/agent/session",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const res = await ctx.runAction(api.agent.getSessionUrl, {
        userId: body.userId,
        userName: body.userName
      });
      return jsonResponse(res);
    } catch (e) {
      return jsonResponse({ success: false, error: e.message }, 400);
    }
  })
});

// GET /api/menu?restaurantId=...
// ElevenLabs server tool: get_restaurant_menu
http.route({
  path: "/api/menu",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!verifyAgentSecret(request.headers)) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const restaurantId = url.searchParams.get("restaurantId");
    if (!restaurantId) {
      return jsonResponse({ success: false, error: "Missing restaurantId parameter" }, 400);
    }

    try {
      // Cast the string to a valid Convex ID
      const items = await ctx.runQuery(api.menu.getMenu, { restaurantId });
      return jsonResponse({ success: true, items });
    } catch (e) {
      return jsonResponse({ success: false, error: e.message }, 500);
    }
  })
});

// GET /api/foods/search?q=...
// ElevenLabs server tool: search_food
http.route({
  path: "/api/foods/search",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!verifyAgentSecret(request.headers)) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";

    try {
      const results = await ctx.runQuery(api.menu.searchFood, { q });
      return jsonResponse({ success: true, results });
    } catch (e) {
      return jsonResponse({ success: false, error: e.message }, 500);
    }
  })
});

// POST /api/orders
// ElevenLabs server tool: create_order
http.route({
  path: "/api/orders",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyAgentSecret(request.headers)) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    try {
      const body = await request.json();
      const res = await ctx.runMutation(api.orders.createOrder, {
        userId: body.userId,
        restaurantId: body.restaurantId,
        items: body.items,
        channel: body.channel
      });
      return jsonResponse(res);
    } catch (e) {
      return jsonResponse({ success: false, error: e.message }, 400);
    }
  })
});

// GET /api/orders/status?orderId=...
// ElevenLabs server tool: track_order
http.route({
  path: "/api/orders/status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!verifyAgentSecret(request.headers)) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId");
    if (!orderId) {
      return jsonResponse({ success: false, error: "Missing orderId parameter" }, 400);
    }

    try {
      const order = await ctx.runQuery(api.orders.getOrderStatus, { orderId });
      if (!order) {
        return jsonResponse({ success: false, error: "Order not found" }, 404);
      }
      return jsonResponse({ success: true, order });
    } catch (e) {
      return jsonResponse({ success: false, error: e.message }, 500);
    }
  })
});

// POST /api/seed
// Utility to seed database in development
http.route({
  path: "/api/seed",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const res = await ctx.runMutation(api.menu.seed);
      return jsonResponse(res);
    } catch (e) {
      return jsonResponse({ success: false, error: e.message }, 500);
    }
  })
});

export default http;
