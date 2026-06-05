from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os

app = FastAPI(
    title="FoodHub AI Service",
    description="FastAPI service for food recommendations, upselling, and nutrition calculations",
    version="1.0.0"
)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5001")

# --- Pydantic Data Models ---
class RecommendRequest(BaseModel):
    userId: Optional[str] = None
    budget: Optional[float] = None
    mood: Optional[str] = None # e.g. "spicy", "heavy", "sweet"
    dietary: Optional[str] = None # e.g. "veg", "non-veg"

class CartItem(BaseModel):
    menuItemId: str
    name: str
    qty: int
    price: float

class UpsellRequest(BaseModel):
    cart: List[CartItem]

class NutritionResponse(BaseModel):
    dish: str
    calories: int
    protein: float
    carbs: float
    fat: float

# --- Routes ---

@app.get("/")
def read_root():
    return {"status": "online", "service": "FoodHub FastAPI AI Service"}

@app.post("/recommend")
async def recommend_foods(req: RecommendRequest):
    try:
        # Search all foods in backend using search query if mood or dietary matches
        search_query = req.mood or req.dietary or ""
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BACKEND_URL}/api/foods/search", 
                params={"q": search_query},
                timeout=5.0
            )
            
            if response.status_code != 200:
                # Fallback to local mockup if backend search is offline/errored
                return get_mock_recommendations(req)

            data = response.json()
            results = data.get("results", [])

            # Filter results by budget
            if req.budget is not None:
                results = [item for item in results if item["basePrice"] <= req.budget]

            # If no items found via search, return mock list
            if not results:
                return get_mock_recommendations(req)

            # Sort and return top 3 items
            return {"success": True, "recommendations": results[:3]}

    except Exception as e:
        # Graceful fallback to mock data on error (makes system highly reliable)
        print(f"Error in recommend endpoint: {e}. Falling back to mocks.")
        return get_mock_recommendations(req)


@app.post("/upsell")
def upsell_items(req: UpsellRequest):
    # Rule-based upselling logic based on current cart
    upsell_recommendations = []
    
    cart_item_names = [item.name.lower() for item in req.cart]
    
    # 1. If biryani/kottu is in the cart, recommend a drink
    has_main = any(x in name for name in cart_item_names for x in ["biryani", "kottu", "rice"])
    has_drink = any(x in name for name in cart_item_names for x in ["coke", "sprite", "soda", "water", "drink"])
    
    if has_main and not has_drink:
        upsell_recommendations.append({
            "name": "Coke",
            "price": 200,
            "reason": "Biryani goes best with a cold Coke!"
        })
    
    # 2. General sweet recommendation for dessert
    has_dessert = any("dessert" in name or "watalappan" in name for name in cart_item_names)
    if not has_dessert:
        upsell_recommendations.append({
            "name": "Watalappan",
            "price": 350,
            "reason": "Top off your Sri Lankan meal with a traditional Watalappan dessert!"
        })

    # Return up to 2 upsell options
    return {
        "success": True,
        "upsells": upsell_recommendations[:2]
    }


@app.get("/nutrition", response_model=NutritionResponse)
def get_nutrition(dish: str = Query(..., description="Name of the dish")):
    dish_lower = dish.lower()
    
    # Simple rule-based database matching common food items in Sri Lanka
    if "biryani" in dish_lower:
        return NutritionResponse(dish=dish, calories=750, protein=35.0, carbs=90.0, fat=25.0)
    elif "kottu" in dish_lower:
        return NutritionResponse(dish=dish, calories=680, protein=28.0, carbs=80.0, fat=22.0)
    elif "coke" in dish_lower:
        return NutritionResponse(dish=dish, calories=140, protein=0.0, carbs=39.0, fat=0.0)
    elif "watalappan" in dish_lower:
        return NutritionResponse(dish=dish, calories=320, protein=8.0, carbs=45.0, fat=12.0)
    else:
        # Default average estimation
        return NutritionResponse(dish=dish, calories=450, protein=15.0, carbs=55.0, fat=18.0)


# --- Helper fallback function for recommendations ---
def get_mock_recommendations(req: RecommendRequest):
    # Setup some mock items matching Sri Lankan theme
    items = [
        {
            "name": "Chicken Biryani",
            "basePrice": 1000,
            "restaurant": {"name": "ABC Biryani House"},
            "tags": ["spicy", "chicken"]
        },
        {
            "name": "Chicken Kottu",
            "basePrice": 850,
            "restaurant": {"name": "Spice Garden"},
            "tags": ["spicy", "chicken"]
        },
        {
            "name": "Egg Kottu",
            "basePrice": 700,
            "restaurant": {"name": "Spice Garden"},
            "tags": ["spicy", "egg", "vegetarian"]
        }
      ]

    # Filter by budget
    if req.budget is not None:
        items = [item for item in items if item["basePrice"] <= req.budget]
        
    # Filter by veg preference
    if req.dietary == "veg":
        items = [item for item in items if "vegetarian" in item.get("tags", [])]

    return {"success": True, "recommendations": items[:2], "source": "mock"}
