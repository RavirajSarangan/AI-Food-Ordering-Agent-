import React, { useState, useEffect } from 'react';
import { 
  Mic, 
  MapPin, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Database, 
  RefreshCw, 
  ShoppingCart, 
  Trash2, 
  X, 
  Star, 
  Clock, 
  ChevronRight,
  ChevronDown,
  Sun,
  Moon
} from 'lucide-react';

// --- Convex Imports ---
import { ConvexProvider, ConvexReactClient, useConvex, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

// --- ElevenLabs Browser SDK ---
import { useConversation, ConversationProvider } from "@elevenlabs/react";

const VITE_CONVEX_URL = import.meta.env.VITE_CONVEX_URL || "https://dutiful-tapir-821.convex.cloud";

const COLORS = {
  primary: '#FF5A1F',
  primaryDeep: '#C8390B',
  accent: '#FFB703',
  bg: '#0E0F12',
  text: '#FFFFFF',
  muted: '#9AA0A6',
  success: '#22C55E',
  error: '#EF4444',
};

export default function App() {
  if (VITE_CONVEX_URL) {
    const convexClient = new ConvexReactClient(VITE_CONVEX_URL);
    return (
      <ConvexProvider client={convexClient}>
        <ConversationProvider>
          <MainApp isConvex={true} />
        </ConversationProvider>
      </ConvexProvider>
    );
  }
  return (
    <ConversationProvider>
      <MainApp isConvex={false} />
    </ConversationProvider>
  );
}

function MainApp({ isConvex }) {
  const convex = isConvex ? useConvex() : null;

  const [theme, setTheme] = useState('dark');
  const [language, setLanguage] = useState('EN');
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  useEffect(() => {
    document.body.className = theme === 'dark' ? '' : 'light-theme';
  }, [theme]);

  // Voice Agent State
  // 'idle' | 'listening' | 'thinking' | 'speaking' | 'tool_running' | 'success' | 'error'
  const [voiceState, setVoiceState] = useState('idle');

  const getOrbColor = () => {
    switch (voiceState) {
      case 'listening': return COLORS.primary;
      case 'speaking': return '#818CF8';
      case 'thinking':
      case 'tool_running': return COLORS.accent;
      case 'success': return COLORS.success;
      case 'error': return COLORS.error;
      default: return theme === 'dark' ? '#374151' : '#E5E7EB';
    }
  };

  // Seeding State
  const [seeding, setSeeding] = useState(false);

  // Active User & Restaurant IDs from seeding
  const [userId, setUserId] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);

  // Voice Assistant Drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  const [caption, setCaption] = useState("Click the microphone to start ordering...");
  const [transcript, setTranscript] = useState("");

  // Cart State (Source of Truth)
  const [cart, setCart] = useState([]);
  const [restaurantName, setRestaurantName] = useState("");

  // Active Order for Real-time Tracking
  const [activeOrderId, setActiveOrderId] = useState(null);

  // --- ElevenLabs Integration ---
  const conversation = useConversation({
    onConnect: () => {
      setVoiceState('listening');
      setCaption("Assistant connected. Speak now!");
    },
    onDisconnect: () => {
      setVoiceState('idle');
      setCaption("Assistant disconnected.");
    },
    onMessage: (message) => {
      if (message.source === 'user') {
        setTranscript(message.message);
      } else if (message.source === 'ai') {
        setCaption(message.message);
        setVoiceState('speaking');
      }
    },
    onError: (err) => {
      console.error(err);
      setCaption("ElevenLabs connection error: " + err.message);
      setVoiceState('error');
    }
  });

  // Track ElevenLabs voice state transitions
  useEffect(() => {
    if (conversation.status === 'connecting') {
      setVoiceState('thinking');
      setCaption("Initializing voice session...");
    } else if (conversation.status === 'connected' && !conversation.isSpeaking) {
      setVoiceState('listening');
    } else if (conversation.status === 'connected' && conversation.isSpeaking) {
      setVoiceState('speaking');
    }
  }, [conversation.status, conversation.isSpeaking]);

  // Start Voice Session
  const handleStartVoiceSession = async () => {
    if (conversation.status === 'connected') {
      await conversation.endSession();
      return;
    }

    setVoiceState('thinking');
    setCaption("Requesting secure session token...");

    try {
      // Call our Convex HTTP endpoint to get the signed URL
      const response = await fetch(`${VITE_CONVEX_URL.replace(".cloud", ".site")}/api/agent/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId || "anonymous_web_user",
          userName: "Web Guest"
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const data = await response.json();
      if (!data.success || !data.signedUrl) {
        throw new Error(data.error || "Missing signed URL");
      }

      // Request browser mic permissions and connect session
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await conversation.startSession({
        signedUrl: data.signedUrl,
        dynamicVariables: {
          userId: userId || "anonymous_web_user",
          userName: "Web Guest"
        }
      });
    } catch (e) {
      console.error(e);
      setCaption("Failed to start session: " + e.message);
      setVoiceState('error');
    }
  };

  // --- Seed Convex Database ---
  const handleSeedDatabase = async () => {
    if (!isConvex) return;
    setSeeding(true);
    setCaption("Seeding database tables...");
    try {
      const result = await convex.mutation(api.menu.seed);
      setUserId(result.userId);
      setRestaurantId(result.restaurants[0].id);
      setCaption("Convex cloud database seeded successfully!");
      setVoiceState('success');
      setTimeout(() => setVoiceState('idle'), 2500);
    } catch (e) {
      console.error(e);
      setCaption("Seeding failed: " + e.message);
      setVoiceState('error');
    } finally {
      setSeeding(false);
    }
  };

  // --- Client Tool Handlers ---
  const handleAddToCart = (item) => {
    setCart(prevCart => {
      const existing = prevCart.find(i => i.menuItemId === item.menuItemId && i.size === item.size);
      if (existing) {
        return prevCart.map(i => 
          (i.menuItemId === item.menuItemId && i.size === item.size) 
            ? { ...i, qty: i.qty + 1 } 
            : i
        );
      }
      return [...prevCart, { ...item, qty: 1 }];
    });
    setCaption(`Added ${item.name} to cart.`);
  };

  const handleRemoveFromCart = (menuItemId, size) => {
    setCart(prevCart => {
      const existing = prevCart.find(i => i.menuItemId === menuItemId && i.size === size);
      if (!existing) return prevCart;
      if (existing.qty === 1) {
        return prevCart.filter(i => !(i.menuItemId === menuItemId && i.size === size));
      }
      return prevCart.map(i => 
        (i.menuItemId === menuItemId && i.size === size) 
          ? { ...i, qty: i.qty - 1 } 
          : i
      );
    });
    setCaption("Removed item from cart.");
  };

  const clearCart = () => {
    setCart([]);
    setRestaurantName("");
    setRestaurantId(null);
    setActiveOrderId(null);
    setCaption("Cart cleared.");
  };

  // --- Submit Order to Convex ---
  const submitOrderToConvex = async () => {
    if (!isConvex) return;
    setVoiceState('tool_running');
    setCaption("Submitting order to Convex...");

    try {
      let activeUserId = userId;
      if (!activeUserId) {
        const seedResult = await convex.mutation(api.menu.seed);
        activeUserId = seedResult.userId;
        setUserId(activeUserId);
      }

      let activeRestId = restaurantId;
      if (!activeRestId) {
        const searchResult = await convex.query(api.menu.searchFood, { q: "biryani" });
        if (searchResult.length > 0) {
          activeRestId = searchResult[0].restaurant.id;
          setRestaurantId(activeRestId);
        } else {
          throw new Error("Seeded tables missing. Run 'Seed DB' at the top first.");
        }
      }

      const orderItems = cart.map(item => ({
        menuItemId: item.menuItemId,
        name: item.name,
        size: item.size,
        qty: item.qty,
        price: item.price
      }));

      const orderResult = await convex.mutation(api.orders.createOrder, {
        userId: activeUserId,
        restaurantId: activeRestId,
        items: orderItems,
        channel: "voice"
      });

      setActiveOrderId(orderResult.orderId);
      setVoiceState('success');
      setCaption(`Order #${orderResult.orderNumber} placed successfully! Rider is on the way.`);
    } catch (e) {
      console.error(e);
      setCaption("Order submission failed: " + e.message);
      setVoiceState('error');
    }
  };

  // --- Voice Simulator Scenarios ---
  const runScenarioOrder = async () => {
    clearCart();
    setVoiceState('listening');
    setTranscript("I'd like a chicken biryani from ABC Biryani House");
    setCaption("Listening...");

    setTimeout(async () => {
      setVoiceState('tool_running');
      setCaption("Searching database for ABC Biryani House...");

      if (isConvex) {
        try {
          const searchResult = await convex.query(api.menu.searchFood, { q: "biryani" });
          if (searchResult.length > 0) {
            const match = searchResult[0];
            setRestaurantName(match.restaurant.name);
            setRestaurantId(match.restaurant.id);
            setVoiceState('speaking');
            setCaption("Would you like a regular (Rs.1,000) or large (Rs.1,400) Chicken Biryani?");
          } else {
            setCaption("Biryani House not found. Make sure to click 'Seed DB' at the top first!");
            setVoiceState('error');
          }
        } catch (e) {
          setCaption("Search failed: " + e.message);
          setVoiceState('error');
        }
      } else {
        setRestaurantName("ABC Biryani House");
        setTimeout(() => {
          setVoiceState('speaking');
          setCaption("Would you like a regular (Rs.1,000) or large (Rs.1,400) Chicken Biryani?");
        }, 1200);
      }
    }, 2000);
  };

  const runScenarioAddLarge = () => {
    setVoiceState('listening');
    setTranscript("Make it a large one please.");
    setCaption("Listening...");

    setTimeout(async () => {
      setVoiceState('tool_running');
      setCaption("Updating cart...");

      let itemConfig = {
        menuItemId: "jd72n0aygtjjck6vc9t2rj4hbh882tpk", // seeded ID fallback
        name: "Chicken Biryani",
        size: "large",
        price: 1400
      };

      if (isConvex && restaurantId) {
        try {
          const searchResult = await convex.query(api.menu.searchFood, { q: "biryani" });
          const match = searchResult.find(item => item.restaurant.id === restaurantId);
          if (match) {
            const largeSize = match.sizes.find(s => s.label === "large");
            itemConfig = {
              menuItemId: match.menuItemId,
              name: match.name,
              size: "large",
              price: largeSize ? largeSize.price : match.basePrice
            };
          }
        } catch (e) {
          console.warn(e);
        }
      }

      handleAddToCart(itemConfig);
      setVoiceState('speaking');
      setCaption("Added large Chicken Biryani. Would you like a drink with that?");
    }, 2000);
  };

  const runScenarioAddDrink = () => {
    setVoiceState('listening');
    setTranscript("Yes, add a Coke.");
    setCaption("Listening...");

    setTimeout(async () => {
      setVoiceState('tool_running');
      setCaption("Adding beverage...");

      let drinkConfig = {
        menuItemId: "jd72n0aygtjjck6vc9t2rj4hbh882tpk", // seeded ID fallback
        name: "Coke",
        size: "regular",
        price: 200
      };

      if (isConvex && restaurantId) {
        try {
          const searchResult = await convex.query(api.menu.searchFood, { q: "coke" });
          const match = searchResult.find(item => item.restaurant.id === restaurantId);
          if (match) {
            drinkConfig = {
              menuItemId: match.menuItemId,
              name: match.name,
              size: "regular",
              price: match.basePrice
            };
          }
        } catch (e) {
          console.warn(e);
        }
      }

      handleAddToCart(drinkConfig);
      setVoiceState('speaking');
      const sub = cart.reduce((sum, item) => sum + (item.price * item.qty), 0) + 1400 + 200;
      setCaption(`Your total is Rs. ${(sub + 150).toLocaleString()} (including Rs. 150 delivery). Shall I place the order?`);
    }, 2000);
  };

  const runScenarioConfirm = () => {
    setVoiceState('listening');
    setTranscript("Yes, place it.");
    setCaption("Listening...");

    setTimeout(() => {
      if (isConvex) {
        submitOrderToConvex();
      } else {
        setVoiceState('tool_running');
        setCaption("Creating your order in the kitchen...");
        setTimeout(() => {
          setVoiceState('success');
          setCaption("Done! Order #4821 placed successfully. Delivery in 15 mins.");
        }, 2000);
      }
    }, 1500);
  };

  // Totals calculations
  const subtotalAmount = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const deliveryFeeAmount = subtotalAmount > 0 ? 150 : 0;
  const totalAmount = subtotalAmount + deliveryFeeAmount;

  return (
    <div className="web-shell">
      {/* --- HEADER --- */}
      <header className="main-header">
        <div className="container header-flex">
          <div className="brand-group">
            <span className="brand-logo">FoodHub AI</span>
            <div className="badge-row">
              <div className="badge badge-convex">
                <Database size={10} style={{ marginRight: 4 }} />
                {isConvex ? "Convex DB Connected" : "Demo Mode"}
              </div>
              <div className="badge-location">
                <MapPin size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Colombo, SL
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isConvex && (
              <button 
                className="btn btn-secondary btn-seed"
                onClick={handleSeedDatabase}
                disabled={seeding}
              >
                <RefreshCw size={11} className={seeding ? "spin-icon" : ""} style={{ marginRight: 4 }} />
                Seed DB
              </button>
            )}

            {/* Language dropdown */}
            <div className="lang-selector-group">
              <button 
                className="lang-btn"
                onClick={() => setLangMenuOpen(!langMenuOpen)}
              >
                {language} ▾
              </button>
              {langMenuOpen && (
                <div className="lang-dropdown">
                  {['EN', 'TA', 'SI'].map(lang => (
                    <button
                      key={lang}
                      className="dropdown-item"
                      onClick={() => {
                        setLanguage(lang);
                        setLangMenuOpen(false);
                      }}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Theme Toggle Button */}
            <button 
              className="theme-toggle-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </header>

      {/* --- LANDING HERO --- */}
      <section className="hero-section">
        <div className="container">
          <h1 className="hero-title">
            Delicious Food, <br />
            <span>Spoken Into Existence.</span>
          </h1>
          <p className="hero-subtitle">
            Order food naturally by speaking to your browser in English, Tamil, or Sinhala. No menus, no tapping — just speak.
          </p>
          <button 
            className="btn btn-primary"
            onClick={() => setIsDrawerOpen(true)}
            style={{ padding: '14px 28px', fontSize: '15px' }}
          >
            <Mic size={18} />
            Start Voice Order
          </button>
        </div>
      </section>

      {/* --- CUISINES GRID --- */}
      <section className="container" style={{ marginBottom: '40px' }}>
        <h2 className="section-title">Browse Cuisines</h2>
        <div className="cuisines-grid">
          {[
            { icon: "🍛", name: "Biryani" },
            { icon: "🥞", name: "Kottu" },
            { icon: "🍲", name: "Curry" },
            { icon: "🥤", name: "Beverages" },
            { icon: "🍰", name: "Dessert" },
          ].map((cuisine, idx) => (
            <div key={idx} className="cuisine-card" onClick={() => setIsDrawerOpen(true)}>
              <div className="cuisine-icon">{cuisine.icon}</div>
              <div className="cuisine-name">{cuisine.name}</div>
            </div>
          ))}
        </div>
      </section>

      {/* --- RESTAURANTS LIST --- */}
      <section className="container">
        <h2 className="section-title">Popular Restaurants</h2>
        <div className="restaurants-grid">
          
          <div className="restaurant-card" onClick={() => setIsDrawerOpen(true)}>
            <div className="restaurant-cover" style={{ backgroundImage: "url('/abc_biryani_cover.png')" }}>
              <span className="restaurant-tag">Promo</span>
            </div>
            <div className="restaurant-content">
              <h3>ABC Biryani House</h3>
              <div className="restaurant-info-row">
                <span className="restaurant-rating">
                  <Star size={12} fill="#FFB703" />
                  4.5 (120+ ratings)
                </span>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Biryani • Rs. 1000 min</span>
              </div>
            </div>
          </div>

          <div className="restaurant-card" onClick={() => setIsDrawerOpen(true)}>
            <div className="restaurant-cover" style={{ backgroundImage: "url('/spice_garden_cover.png')" }}>
              <span className="restaurant-tag">Sri Lankan</span>
            </div>
            <div className="restaurant-content">
              <h3>Spice Garden</h3>
              <div className="restaurant-info-row">
                <span className="restaurant-rating">
                  <Star size={12} fill="#FFB703" />
                  4.2 (85+ ratings)
                </span>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Kottu • Rs. 700 min</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* --- VOICE ASSISTANT DRAWER PANEL --- */}
      {isDrawerOpen && (
        <div className="dashboard-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="dashboard-panel" onClick={(e) => e.stopPropagation()}>
            
            <div className="dashboard-header">
              <h2 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mic size={18} color={COLORS.primary} />
                Voice Ordering Assistant
              </h2>
              <button className="close-btn" onClick={() => setIsDrawerOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="dashboard-scroll">
              
              {/* Voice Orb Area */}
              <div className="orb-container">
                <div className={`orb-ring ${voiceState === 'listening' ? 'active-pulse' : ''}`} style={{ borderColor: getOrbColor() }} />
                <div 
                  className={`orb-core ${voiceState}`} 
                  style={{ backgroundColor: getOrbColor() }}
                  onClick={handleStartVoiceSession}
                >
                  {voiceState === 'success' ? (
                    <CheckCircle2 color={COLORS.text} size={36} />
                  ) : voiceState === 'error' ? (
                    <XCircle color={COLORS.text} size={36} />
                  ) : (
                    <Mic color={COLORS.text} size={32} />
                  )}
                </div>
                <div className="state-tag" style={{ backgroundColor: getOrbColor(), color: COLORS.text }}>
                  {voiceState}
                </div>
              </div>

              {/* Speech Captions */}
              <div className="dialogue-box">
                <p className="caption-text">"{caption}"</p>
                {transcript !== "" && (
                  <p className="transcript-text">You said: {transcript}</p>
                )}
              </div>

              {/* Real-time Rider Tracking */}
              {isConvex && activeOrderId && (
                <ConvexOrderTracker orderId={activeOrderId} />
              )}

              {/* Shopping Cart Sync */}
              <div className="cart-card">
                <div className="cart-card-header">
                  <div className="cart-card-title">
                    <ShoppingCart size={16} color={COLORS.primary} />
                    Active Cart
                  </div>
                  {restaurantName && (
                    <span className="restaurant-chip">{restaurantName}</span>
                  )}
                </div>

                {cart.length === 0 ? (
                  <div className="empty-cart">
                    <p style={{ fontSize: '13px', fontWeight: '500' }}>Your cart is empty.</p>
                    <p style={{ fontSize: '11px', marginTop: '4px' }}>Items spoken aloud will display here in real time.</p>
                  </div>
                ) : (
                  <div>
                    {cart.map((item, idx) => (
                      <div key={`${item.menuItemId}-${item.size}-${idx}`} className="cart-item-row">
                        <div>
                          <div className="item-name">{item.name}</div>
                          <div className="item-details">Size: {item.size}</div>
                        </div>
                        <div className="qty-price-group">
                          <span className="item-qty">x{item.qty}</span>
                          <span className="item-price">Rs. {(item.price * item.qty).toLocaleString()}</span>
                          <button 
                            className="trash-btn"
                            onClick={() => handleRemoveFromCart(item.menuItemId, item.size)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="price-summary">
                      <div className="summary-row">
                        <span>Subtotal</span>
                        <span>Rs. {subtotalAmount.toLocaleString()}</span>
                      </div>
                      <div className="summary-row">
                        <span>Delivery Fee</span>
                        <span>Rs. {deliveryFeeAmount.toLocaleString()}</span>
                      </div>
                      <div className="summary-row summary-total">
                        <span>Total Amount</span>
                        <span className="total-amount">Rs. {totalAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Dev Simulator Panel */}
            <div className="dev-drawer">
              <div className="dev-header">
                <Play size={10} color={COLORS.accent} />
                ElevenLabs Client Tool Simulator
              </div>
              <div className="dev-actions-wrapper">
                <button className="dev-btn" onClick={runScenarioOrder}>1. Order Biryani</button>
                <button className="dev-btn" onClick={runScenarioAddLarge}>2. Select Large</button>
                <button className="dev-btn" onClick={runScenarioAddDrink}>3. Add Coke</button>
                <button className="dev-btn" onClick={runScenarioConfirm}>4. Confirm Order</button>
                <button 
                  className="dev-btn dev-btn-reset" 
                  onClick={() => {
                    setVoiceState('idle');
                    setTranscript('');
                    setCaption('Assistant reset.');
                    setActiveOrderId(null);
                  }}
                >
                  Reset
                </button>
                <button className="dev-btn dev-btn-reset" onClick={clearCart}>Clear Cart</button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// --- Convex Real-time Order Tracking Subscription Component ---
function ConvexOrderTracker({ orderId }) {
  const order = useQuery(api.orders.getOrderStatus, { orderId });

  if (!order) {
    return (
      <div className="tracker-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ActivityIndicator />
          <span style={{ fontSize: '12px' }}>Connecting to live rider stream...</span>
        </div>
      </div>
    );
  }

  const getStatusColor = () => {
    switch (order.status) {
      case 'Delivered': return COLORS.success;
      case 'OnTheWay': return COLORS.accent;
      default: return COLORS.primary;
    }
  };

  const getProgressWidth = () => {
    switch (order.status) {
      case 'Placed': return '25%';
      case 'Preparing': return '50%';
      case 'OnTheWay': return '75%';
      case 'Delivered': return '100%';
      default: return '10%';
    }
  };

  return (
    <div className="tracker-card">
      <div className="tracker-title">Live Rider Tracker (Order #{order.orderNumber})</div>
      
      <div className="tracker-progress-bg">
        <div 
          className="tracker-progress-bar" 
          style={{ width: getProgressWidth(), backgroundColor: getStatusColor() }} 
        />
      </div>

      <div className="tracker-details">
        <div>
          <div className="tracker-label">Status</div>
          <div className="tracker-value" style={{ color: getStatusColor() }}>{order.status}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tracker-label">ETA</div>
          <div className="tracker-value">{order.rider?.etaMins > 0 ? `${order.rider.etaMins} mins` : "Delivered ✓"}</div>
        </div>
      </div>

      {order.rider && (
        <div className="rider-gps-box">
          Rider GPS: {order.rider.lat.toFixed(4)}, {order.rider.lng.toFixed(4)}
          <p style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '2px', fontWeight: 'normal' }}>
            Simulating live movement to Colombo address...
          </p>
        </div>
      )}
    </div>
  );
}

// Helper Loader
function ActivityIndicator() {
  return (
    <div className="spinner" style={{
      width: '14px',
      height: '14px',
      borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.2)',
      borderTopColor: COLORS.primary,
      animation: 'rotateSpin 1s infinite linear'
    }} />
  );
}
