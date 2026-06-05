# FoodHub AI Voice Ordering Assistant

> A voice-first, multi-language food ordering layer built on top of Convex, Expo React Native, and FastAPI, powered by ElevenLabs Agents.

---

<div align="center">

[![Convex Database](https://img.shields.io/badge/Database-Convex-06B6D4?style=for-the-badge&logo=convex)](https://convex.dev)
[![React Native Expo](https://img.shields.io/badge/Mobile-React_Native_Expo-000000?style=for-the-badge&logo=expo)](https://expo.dev)
[![FastAPI AI Service](https://img.shields.io/badge/AI_Service-FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![ElevenLabs Agent](https://img.shields.io/badge/Voice_Agent-ElevenLabs-E11D48?style=for-the-badge)](https://elevenlabs.io)
[![Languages](https://img.shields.io/badge/Languages-EN%20%7C%20TA%20%7C%20SI-FFB703?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

</div>

---

## 📖 Table of Contents
* [1. System Architecture](#1-system-architecture)
* [2. Data Models & Convex Schema](#2-data-models--convex-schema)
* [3. Voice Orb & UI Animations](#3-voice-orb--ui-animations)
* [4. API Routing & ElevenLabs Webhooks](#4-api-routing--elevenlabs-webhooks)
* [5. Local Development Startup](#5-local-development-startup)

---

## 1. System Architecture

FoodHub Voice utilizes **Convex** for real-time data sync, database queries, and serverless background execution, replacing traditional Express/MongoDB pipelines:

```
                ┌────────────────────────────────────────┐
                │        React Native Mobile App         │
                │  - M3 Paper UI (ripple buttons, cards) │
                │  - Voice orb (pulses & rotate states)  │
                │  - Real-time tracker (useQuery sync)   │
                └───────────────┬────────────────────────┘
                                │  1. Subscribes & Mutates
                                ▼
                ┌────────────────────────────────────────┐
                │          Convex Cloud Engine           │
                │  - Database (Real-time collections)     │
                │  - HTTP Webhook Handlers (http.js)     │
                │  - Scheduled Rider mutations           │
                └───────────────┬────────────────────────┘
                                │  2. Webhook triggers
                                ▼
                ┌────────────────────────────────────────┐
                │            ElevenLabs Agent            │
                │  - STT → Multilingual LLM → TTS        │
                │  - Triggers Server/Client Tools        │
                └───────────────┬────────────────────────┘
                                │  3. recommendation hooks
                                ▼
                ┌────────────────────────────────────────┐
                │           FastAPI AI Service           │
                │  - /recommend (budget & mood logic)    │
                │  - /upsell (smart complementary items)  │
                │  - /nutrition (macro estimation)       │
                └────────────────────────────────────────┘
```

---

## 2. Data Models & Convex Schema

The database is structured in `convex/schema.js` and enforces strict type validators (`v.string()`, `v.number()`, etc.):

```js
// users
{
  name: v.string(),
  phone: v.string(),
  addresses: v.array(v.object({ label: v.string(), line: v.string(), lat: v.number(), lng: v.number() })),
  defaultPaymentMethod: v.string(),
  language: v.string(), // "en" | "ta" | "si"
  preferences: v.object({ spicy: v.boolean(), veg: v.boolean() })
}

// restaurants
{
  name: v.string(),
  location: v.object({ lat: v.number(), lng: v.number() }),
  rating: v.number(),
  isOpen: v.boolean(),
  cuisines: v.array(v.string())
}

// menuItems
{
  restaurantId: v.id("restaurants"),
  name: v.string(),
  nameLocalized: v.object({ ta: v.optional(v.string()), si: v.optional(v.string()) }),
  basePrice: v.number(),
  sizes: v.array(v.object({ label: v.string(), price: v.number() })),
  options: v.array(v.object({ name: v.string(), values: v.array(v.string()) })),
  tags: v.array(v.string()),
  calories: v.optional(v.number()),
  protein: v.optional(v.number()),
  available: v.boolean()
}

// orders
{
  userId: v.id("users"),
  restaurantId: v.id("restaurants"),
  items: v.array(v.object({ menuItemId: v.id("menuItems"), name: v.string(), size: v.optional(v.string()), qty: v.number(), price: v.number() })),
  subtotal: v.number(),
  deliveryFee: v.number(),
  total: v.number(),
  status: v.string(), // "Placed" | "Preparing" | "OnTheWay" | "Delivered"
  channel: v.string(),
  rider: v.optional(v.object({ id: v.string(), lat: v.number(), lng: v.number(), etaMins: v.number() })),
  createdAt: v.number()
}
```

---

## 3. Voice Orb & UI Animations

The **Voice Orb** is a fluid layout state-machine transitioning between 7 communication states. Animations are handled via the React Native `Animated` driver to guarantee high frame rates:

| State | Orb Visual | Haptic / Motion | Purpose |
| :--- | :--- | :--- | :--- |
| **`idle`** | Static dark gray mic orb | None | Awaiting user tap |
| **`listening`** | Vibrant orange pulsing ring | Easing pulse (0.8s cycle, scale 1.0 ➔ 1.25) | User speaking |
| **`thinking`** | Shimmering yellow rotating circle | Infinite linear 360° spin (1.2s cycle) | LLM token processing |
| **`speaking`** | Soft violet wave orb | Mic-level waves | Agent reading responses |
| **`tool_running`**| Shimmering spinner | Linear rotation + inner spinner | Querying Convex API |
| **`success`** | Green check burst | Scale burst bounce + success haptic | Order confirmed / database seeded |
| **`error`** | Red shake icon | Shake offset animation + error haptic | API fail / network timeout |

### Real-Time Rider Tracking Animation
When a voice order is confirmed:
1. Convex triggers the `orders:createOrder` mutation.
2. An internal Convex scheduler (`ctx.scheduler.runAfter`) automatically queue status updates in the future (30s ➔ 60s ➔ 90s).
3. The React Native app's `<ConvexOrderTracker>` listens to `getOrderStatus` via `useQuery` subscription. As status and coordinates change in the cloud, the progress bars and GPS markers glide smoothly in the UI without manual re-querying.

---

## 4. API Routing & ElevenLabs Webhooks

Convex exposes HTTP webhooks under `/api/*` defined inside `convex/http.js`:

| Endpoint | Method | Server Tool Name | Description |
| :--- | :--- | :--- | :--- |
| `/api/agent/session` | `POST` | *Client Hook* | Generates signed ElevenLabs conversation URLs |
| `/api/menu` | `GET` | `get_restaurant_menu` | Returns menu items + prices + options |
| `/api/foods/search` | `GET` | `search_food` | Fuzzy searches dish translation names / tags |
| `/api/orders` | `POST` | `create_order` | Validates prices, charges, and places the order |
| `/api/orders/status` | `GET` | `track_order` | Returns status + rider ETA + coordinates |
| `/api/seed` | `POST` | *Dev Hook* | Clears and seeds mock Colombo database tables |

---

## 5. Local Development Startup

### Setup Environment Configuration
In the workspace root, configure your local environment details (Deploy Key must contain `name|secret`):

```bash
# In /.env.local and /convex/.env.local
CONVEX_DEPLOYMENT=dev:dutiful-tapir-821
CONVEX_DEPLOY_KEY=dev:dutiful-tapir-821|eyJ2MiI6IjAzZWE0ODhjNGE2YjQzODhhODhiZjRlNmQ1MWE3MDJjIn0=
```

In the mobile client directory, connect the app:
```bash
# In /mobile/.env
EXPO_PUBLIC_CONVEX_URL=https://dutiful-tapir-821.convex.cloud
```

### 1. Launch Convex Serverless Dev
```bash
npx convex dev
```

### 2. Seed Mock Database Tables
Once Convex is synchronized, run the seed mutation:
```bash
npx convex run menu:seed
```

### 3. Launch FastAPI Recommendation Server
```bash
cd fastapi
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 4. Launch Mobile Expo Go
```bash
cd mobile
npm run start
```
Scan the QR code in your console using the **Expo Go** application on iOS or Android. You can test the dynamic voice orb state transitions and cart sync using the simulator drawer on the bottom of the interface!