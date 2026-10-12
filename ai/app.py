"""
SANSKRITI AI Culture Lens service.
FastAPI microservice exposing /identify and /describe.
Uses Google Gemini if GEMINI_API_KEY is set, otherwise falls back to a
keyword-based heuristic analysis so the MVP works without external keys.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os

app = FastAPI(title="SANSKRITI AI Culture Lens", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_KEY = os.getenv("GEMINI_API_KEY")

# Lightweight cultural knowledge base for heuristic matching
KNOWLEDGE = [
    {
        "keys": ["kathak", "dance", "ghungroo", "lucknow", "gharana"],
        "id": "Kathak",
        "art_form": "Kathak (Classical Dance)",
        "region": "North India (Uttar Pradesh)",
        "period": "Mughal era",
        "history": "Kathak evolved from the storytelling of ancient Kathakars and flourished in the Mughal courts of Awadh.",
        "significance": "One of India's eight classical dance forms, famed for rhythmic footwork and spins.",
    },
    {
        "keys": ["banarasi", "sari", "silk", "weaving", "brocade", "zari"],
        "id": "Banarasi Silk",
        "art_form": "Banarasi Silk Weaving (Zari Brocade)",
        "region": "Varanasi, Uttar Pradesh",
        "period": "Mughal era",
        "history": "Persian weavers brought brocade to Banaras under Mughal patronage; the craft became iconic across India.",
        "significance": "A GI-tagged craft synonymous with Indian weddings and festivity.",
    },
    {
        "keys": ["kathakali", "kerala", "mask", "drama", "makeup", "green"],
        "id": "Kathakali",
        "art_form": "Kathakali (Classical Dance-Drama)",
        "region": "Kerala",
        "period": "17th century",
        "history": "Kathakali developed from older temple arts, combining dance, music, and elaborate theatrical makeup.",
        "significance": "Renowned for intricate green makeup and expressive eye movement (nethraabhinaya).",
    },
    {
        "keys": ["warli", "painting", "tribal", "mud", "maharashtra"],
        "id": "Warli Painting",
        "art_form": "Warli Tribal Painting",
        "region": "Thane, Maharashtra",
        "period": "Ancient",
        "history": "Painted by the Warli tribe on mud walls using rice paste and natural pigments.",
        "significance": "A celebrated geometric art form depicting daily rural life and nature.",
    },
    {
        "keys": ["madhubani", "mithila", "bihar", "folk", "painting"],
        "id": "Madhubani Painting",
        "art_form": "Madhubani (Mithila) Folk Painting",
        "region": "Mithila, Bihar",
        "period": "Ancient",
        "history": "Traditionally drawn by women on walls and floors during festivals and weddings.",
        "significance": "Bold colours and intricate line work depicting nature and mythology.",
    },
    {
        "keys": ["taj", "agra", "mausoleum", "marble", "monument", "shah jahan"],
        "id": "Taj Mahal",
        "art_form": "Mughal Monument Architecture",
        "region": "Agra, Uttar Pradesh",
        "period": "Mughal (17th century)",
        "history": "Built by Shah Jahan in memory of Mumtaz Mahal from 1632 to 1653.",
        "significance": "A UNESCO World Heritage Site and one of the Seven Wonders of the World.",
    },
    {
        "keys": ["nataraja", "bronze", "chola", "tamil", "dancing", "shiva"],
        "id": "Nataraja Bronze",
        "art_form": "Chola Bronze Sculpture",
        "region": "Tamil Nadu",
        "period": "Chola era (Medieval)",
        "history": "Lost-wax bronze castings of the dancing Shiva became the signature of Chola art.",
        "significance": "A masterpiece of Indian metal sculpture combining dance and devotion.",
    },
    {
        "keys": ["pattachitra", "odisha", "scroll", "jagannath", "puri"],
        "id": "Pattachitra",
        "art_form": "Pattachitra Scroll Painting",
        "region": "Raghurajpur, Odisha",
        "period": "Ancient",
        "history": "One of India's oldest painting traditions, tied to the Jagannath temple at Puri.",
        "significance": "Vibrant cloth paintings using natural colours to narrate mythology.",
    },
]

class IdentifyRequest(BaseModel):
    query: Optional[str] = ""
    image_b64: Optional[str] = None

class DescribeRequest(BaseModel):
    query: Optional[str] = ""
    image_b64: Optional[str] = None

def heuristic(query: str):
    q = query.lower()
    for item in KNOWLEDGE:
        score = sum(1 for k in item["keys"] if k in q)
        if score > 0:
            related = [k["id"] for k in KNOWLEDGE if k != item and score >= 0]
            return {
                "possible_identification": item["id"],
                "art_form": item["art_form"],
                "region": item["region"],
                "period": item["period"],
                "history": item["history"],
                "significance": item["significance"],
                "confidence": min(95, 55 + score * 8),
                "related": related[:3],
            }
    return {
        "possible_identification": "Unidentified cultural object",
        "art_form": "Unknown",
        "region": "Unknown",
        "period": "Unknown",
        "history": "No match found. Add more descriptive keywords (e.g. region, material, use).",
        "significance": "Not available.",
        "confidence": 30,
        "related": [],
    }

def gemini(query: str):
    import google.generativeai as genai
    genai.configure(api_key=GEMINI_KEY)
    model = genai.GenerativeModel("gemini-1.5-flash")
    prompt = (
        "You are an expert on Indian cultural heritage. Analyze the following "
        "description of a cultural object/artefact and return JSON with keys: "
        "possible_identification, art_form, region, period, history, "
        "cultural_significance, related_traditions (array). Description: "
        + query +
        "\nReturn only valid JSON."
    )
    resp = model.generate_content(prompt)
    return resp.text

@app.get("/health")
def health():
    return {"status": "ok", "ai": "gemini" if GEMINI_KEY else "heuristic"}

@app.post("/identify")
def identify(req: IdentifyRequest):
    query = req.query or req.image_b64 or ""
    if GEMINI_KEY:
        try:
            text = gemini(query)
            return {"analysis": text, "source": "gemini"}
        except Exception as e:
            return {"analysis": heuristic(query), "source": "gemini-fallback", "error": str(e)}
    return {"analysis": heuristic(query), "source": "heuristic"}

@app.post("/describe")
def describe(req: DescribeRequest):
    query = req.query or req.image_b64 or ""
    a = heuristic(query)
    return {"summary": a["history"], "traditions": [], "source": "heuristic"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
