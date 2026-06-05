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
  Moon,
  Compass,
  Flame
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

  // Automatically retrieve the default user if they already seeded the DB in a past session
  const defaultUser = useQuery(api.orders.getDefaultUser);
  
  useEffect(() => {
    if (defaultUser) {
      setUserId(defaultUser.id);
    }
  }, [defaultUser]);

  // Automatically fetch latest active order from Convex if voice assistant places it
  const latestOrder = useQuery(
    api.orders.getLatestOrder,
    isConvex && userId ? { userId } : "skip"
  );

  useEffect(() => {
    if (latestOrder && latestOrder.status !== "Delivered") {
      setActiveOrderId(latestOrder._id);
      setIsDrawerOpen(true); // Automatically open drawer to track order
    }
  }, [latestOrder, isConvex, userId]);

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
        menuItemId: "dummy_biryani_id", // safe demo fallback
        name: "Chicken Biryani",
        size: "large",
        price: 1400
      };

      if (isConvex) {
        try {
          const searchResult = await convex.query(api.menu.searchFood, { q: "biryani" });
          const match = restaurantId 
            ? (searchResult.find(item => item.restaurant.id === restaurantId) || searchResult[0])
            : searchResult[0];

          if (match) {
            const largeSize = match.sizes.find(s => s.label === "large");
            itemConfig = {
              menuItemId: match.menuItemId,
              name: match.name,
              size: "large",
              price: largeSize ? largeSize.price : match.basePrice
            };
            if (!restaurantId) {
              setRestaurantId(match.restaurant.id);
              setRestaurantName(match.restaurant.name);
            }
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
        menuItemId: "dummy_coke_id", // safe demo fallback
        name: "Coke",
        size: "regular",
        price: 200
      };

      if (isConvex) {
        try {
          const searchResult = await convex.query(api.menu.searchFood, { q: "coke" });
          const match = restaurantId 
            ? (searchResult.find(item => item.restaurant.id === restaurantId) || searchResult[0])
            : searchResult[0];

          if (match) {
            drinkConfig = {
              menuItemId: match.menuItemId,
              name: match.name,
              size: "regular",
              price: match.basePrice
            };
            if (!restaurantId) {
              setRestaurantId(match.restaurant.id);
              setRestaurantName(match.restaurant.name);
            }
          }
        } catch (e) {
          console.warn(e);
        }
      }

      handleAddToCart(drinkConfig);
      setVoiceState('speaking');
      const sub = cart.reduce((sum, item) => sum + (item.price * item.qty), 0) + drinkConfig.price;
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

              {/* Audio-Reactive Waveform Visualizer */}
              <WaveformVisualizer conversation={conversation} voiceState={voiceState} />

              {/* Real-time Rider Tracking */}
              {isConvex && activeOrderId && (
                <ConvexOrderTracker orderId={activeOrderId} />
              )}

              {/* Dynamic Contextual Voice Guide */}
              <ContextualVoiceGuide cart={cart} />

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

// Sound synthesis chime helper
const playStatusSound = (status) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    const playTone = (freq, duration, type = 'sine', startTime = 0) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startTime);
      osc.stop(ctx.currentTime + startTime + duration);
    };

    if (status === 'Placed') {
      playTone(261.63, 0.25, 'sine', 0);    // C4
      playTone(329.63, 0.25, 'sine', 0.08);  // E4
      playTone(392.00, 0.25, 'sine', 0.16);  // G4
      playTone(523.25, 0.45, 'sine', 0.24);  // C5
    } else if (status === 'Preparing') {
      for (let i = 0; i < 5; i++) {
        playTone(300 + Math.random() * 200, 0.06, 'triangle', i * 0.1);
      }
    } else if (status === 'OnTheWay') {
      playTone(440, 0.12, 'sine', 0);
      playTone(440, 0.12, 'sine', 0.2);
    } else if (status === 'Delivered') {
      playTone(523.25, 0.15, 'sine', 0);
      playTone(659.25, 0.15, 'sine', 0.08);
      playTone(783.99, 0.15, 'sine', 0.16);
      playTone(1046.50, 0.5, 'sine', 0.24);
    }
  } catch (e) {
    console.warn("Audio playback blocked or failed:", e);
  }
};

const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// --- Convex Real-time Order Tracking Subscription Component ---
function ConvexOrderTracker({ orderId }) {
  const order = useQuery(api.orders.getOrderStatus, { orderId });
  const [lastStatus, setLastStatus] = React.useState(null);

  React.useEffect(() => {
    if (order && order.status && order.status !== lastStatus) {
      setLastStatus(order.status);
      playStatusSound(order.status);
    }
  }, [order?.status, lastStatus]);

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

  const getRiderPosition = () => {
    if (!order.rider) return { x: 40, y: 70 };
    const rLat = order.rider.lat;
    const rLng = order.rider.lng;
    
    // Coordinates matching orders.js simulation
    const startLat = 6.9150; // Kitchen
    const startLng = 79.8550;
    const endLat = 6.9123;   // Home
    const endLng = 79.8521;
    
    const totalLat = endLat - startLat;
    const totalLng = endLng - startLng;
    
    // Calculate percentage progress between start and end
    const pct = totalLat !== 0 ? (rLat - startLat) / totalLat : 0;
    
    // Interpolate positions along the Bezier curve of the street
    // P0 = (40, 70)
    // P1 = (120, 20)
    // P2 = (200, 120)
    // P3 = (320, 60)
    const t = Math.max(0, Math.min(1, pct));
    const x = Math.pow(1-t, 3)*40 + 3*Math.pow(1-t, 2)*t*120 + 3*(1-t)*Math.pow(t, 2)*200 + Math.pow(t, 3)*320;
    const y = Math.pow(1-t, 3)*70 + 3*Math.pow(1-t, 2)*t*20 + 3*(1-t)*Math.pow(t, 2)*120 + Math.pow(t, 3)*60;
    return { x, y };
  };

  const riderPos = getRiderPosition();
  const distance = order.rider ? getDistanceKm(order.rider.lat, order.rider.lng, 6.9123, 79.8521) : 0;

  return (
    <div className="tracker-card">
      <div className="tracker-title">Live Rider Tracker (Order #{order.orderNumber})</div>
      
      <div className="tracker-progress-bg">
        <div 
          className="tracker-progress-bar" 
          style={{ width: getProgressWidth(), backgroundColor: getStatusColor() }} 
        />
      </div>

      {/* Stepper Timeline */}
      <div className="tracker-stepper">
        <div className="stepper-connector">
          <div 
            className="stepper-connector-active" 
            style={{ width: order.status === 'Placed' ? '0%' : order.status === 'Preparing' ? '33%' : order.status === 'OnTheWay' ? '66%' : '100%' }}
          />
        </div>
        {[
          { key: 'Placed', label: 'Placed', icon: <CheckCircle2 size={12} /> },
          { key: 'Preparing', label: 'Preparing', icon: <Flame size={12} /> },
          { key: 'OnTheWay', label: 'On Way', icon: <Compass size={12} /> },
          { key: 'Delivered', label: 'Delivered', icon: <MapPin size={12} /> }
        ].map((step, idx) => {
          const statusOrder = ['Placed', 'Preparing', 'OnTheWay', 'Delivered'];
          const currentIdx = statusOrder.indexOf(order.status);
          const stepIdx = statusOrder.indexOf(step.key);
          const isCompleted = stepIdx < currentIdx;
          const isActive = stepIdx === currentIdx;
          
          return (
            <div key={step.key} className={`stepper-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
              <div className="stepper-bubble">
                {step.icon}
              </div>
              <div className="stepper-label">{step.label}</div>
            </div>
          );
        })}
      </div>

      <div className="tracker-details">
        <div>
          <div className="tracker-label">Status</div>
          <div className="tracker-value" style={{ color: getStatusColor() }}>
            {order.status === 'Placed' && "Order Placed"}
            {order.status === 'Preparing' && "Preparing Meal"}
            {order.status === 'OnTheWay' && "Out for Delivery"}
            {order.status === 'Delivered' && "Delivered ✓"}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tracker-label">ETA / Distance</div>
          <div className="tracker-value">
            {order.status === 'Delivered' ? (
              "Enjoy your meal!"
            ) : order.rider ? (
              `${order.rider.etaMins} mins (${distance.toFixed(2)} km)`
            ) : (
              "Calculating..."
            )}
          </div>
        </div>
      </div>

      {/* --- Live Interactive SVG Map --- */}
      <div className="live-delivery-map">
        <svg viewBox="0 0 360 130" width="100%" height="100%">
          {/* Background gridlines */}
          <line x1="0" y1="30" x2="360" y2="30" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          <line x1="0" y1="65" x2="360" y2="65" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          <line x1="0" y1="100" x2="360" y2="100" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          <line x1="90" y1="0" x2="90" y2="130" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          <line x1="180" y1="0" x2="180" y2="130" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          <line x1="270" y1="0" x2="270" y2="130" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />

          {/* Street Road Path */}
          <path 
            d="M 40 70 C 120 20, 200 120, 320 60" 
            className="map-street" 
          />
          <path 
            d="M 40 70 C 120 20, 200 120, 320 60" 
            className="map-street-active" 
            strokeDasharray="10, 5"
          />

          {/* Restaurant Marker */}
          <g className="map-marker" transform="translate(40, 70)">
            <circle r="8" fill={COLORS.primary} />
            <circle r="4" fill="#FFF" />
            <text y="-14" textAnchor="middle" className="map-label">KITCHEN</text>
          </g>

          {/* Home Marker */}
          <g className="map-marker" transform="translate(320, 60)">
            <circle r="8" fill={COLORS.success} />
            <polygon points="0,-4 -4,4 4,4" fill="#FFF" />
            <text y="-14" textAnchor="middle" className="map-label">HOME</text>
          </g>

          {/* Live Rider Marker */}
          {order.rider && (
            <g className="map-marker animate-rider" transform={`translate(${riderPos.x}, ${riderPos.y})`}>
              <circle r="7" fill={COLORS.accent} />
              <polygon points="0,-8 5,3 -5,3" fill="#FFF" transform="rotate(45)" />
              <circle r="2.5" fill="#000" />
              <text y="18" textAnchor="middle" className="map-label" fill={COLORS.accent} style={{ fontSize: '7px', fontWeight: '800' }}>RIDER</text>
            </g>
          )}
        </svg>
      </div>

      {order.rider && (
        <div className="rider-gps-box" style={{ marginTop: '10px' }}>
          Rider GPS: {order.rider.lat.toFixed(4)}, {order.rider.lng.toFixed(4)}
          <p style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '2px', fontWeight: 'normal' }}>
            Simulating live movement to Colombo address...
          </p>
        </div>
      )}
    </div>
  );
}

// --- Audio-Reactive Visualizer Component using Web Audio API Frequency Data ---
function WaveformVisualizer({ conversation, voiceState }) {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let dataArray = new Uint8Array(0);
      if (voiceState === 'listening') {
        dataArray = conversation.getInputByteFrequencyData();
      } else if (voiceState === 'speaking') {
        dataArray = conversation.getOutputByteFrequencyData();
      }

      ctx.lineWidth = 2;
      ctx.strokeStyle = voiceState === 'listening' ? '#FF5A1F' : '#818CF8';
      ctx.shadowBlur = 8;
      ctx.shadowColor = ctx.strokeStyle;

      if (dataArray.length > 0) {
        // Draw real frequency spectrum bars
        const barWidth = (canvas.width / dataArray.length) * 2.5;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
        }
      } else {
        // Draw elegant idle sine wave
        ctx.beginPath();
        const time = Date.now() * 0.005;
        for (let x = 0; x < canvas.width; x++) {
          const y = canvas.height / 2 + Math.sin(x * 0.05 + time) * 4;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0; // reset
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, [conversation, voiceState]);

  return (
    <canvas 
      ref={canvasRef} 
      width="320" 
      height="45" 
      className="waveform-canvas" 
      style={{ 
        margin: '15px auto', 
        display: 'block', 
        borderRadius: '8px',
        width: '100%',
        maxWidth: '360px',
        height: '45px'
      }} 
    />
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

// --- Dynamic Contextual Voice Guide Component ---
function ContextualVoiceGuide({ cart }) {
  const getSuggestions = () => {
    if (cart.length === 0) {
      return [
        "Order a Chicken Biryani from ABC Biryani House",
        "Add a Chicken Kottu from Spice Garden",
        "Show me spicy Sri Lankan food recommendations"
      ];
    }
    const hasBiryani = cart.some(item => item.name.toLowerCase().includes("biryani"));
    const hasKottu = cart.some(item => item.name.toLowerCase().includes("kottu"));
    const hasDrink = cart.some(item => ["coke", "sprite", "soda", "water", "drink"].some(d => item.name.toLowerCase().includes(d)));

    const list = [];
    if ((hasBiryani || hasKottu) && !hasDrink) {
      list.push("Add a cold Coke to my order");
    }
    
    // Check if biryani is regular size
    const regularBiryani = cart.find(item => item.name.toLowerCase().includes("biryani") && item.size === "regular");
    if (regularBiryani) {
      list.push("Change the biryani to a large size");
    }

    list.push("Yes, please confirm and place my order");
    list.push("Clear my cart and start over");
    return list;
  };

  const suggestions = getSuggestions();

  return (
    <div className="voice-guide-container">
      <div className="voice-guide-title">Suggested Voice Commands</div>
      <div className="voice-guide-suggestions">
        {suggestions.map((s, idx) => (
          <div key={idx} className="voice-guide-chip">
            🎤 "{s}"
          </div>
        ))}
      </div>
    </div>
  );
}
