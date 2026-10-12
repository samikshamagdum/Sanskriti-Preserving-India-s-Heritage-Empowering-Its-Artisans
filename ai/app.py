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
import base64
import binascii
import os

app = FastAPI(title="SANSKRITI AI Culture Lens", version="1.0.0")

# Configure browser origins through ALLOWED_ORIGINS (comma-separated).
# Local development defaults are included; production should set its own origins.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
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
            related = [
                other["id"]
                for other in KNOWLEDGE
                if other != item and any(key in q for key in other["keys"])
            ]
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

def decode_image(image_b64: str):
    """Decode a base64 image or data URL into Gemini's expected image payload."""
    if not image_b64:
        return None

    mime_type = "image/jpeg"
    encoded = image_b64.strip()
    if encoded.startswith("data:"):
        header, separator, encoded = encoded.partition(",")
        if not separator:
            raise ValueError("Invalid image data URL.")
        mime_type = header[5:].split(";", 1)[0] or mime_type

    if mime_type not in {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}:
        raise ValueError("Unsupported image type. Use JPEG, PNG, WebP, HEIC, or HEIF.")

    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Image must be valid base64 data.") from exc

    if not image_bytes:
        raise ValueError("Image data is empty.")
    if len(image_bytes) > 10 * 1024 * 1024:
        raise ValueError("Image must be 10 MB or smaller.")

    return {"mime_type": mime_type, "data": image_bytes}


def gemini(query: str, image_b64: Optional[str] = None):
    import google.generativeai as genai

    genai.configure(api_key=GEMINI_KEY)
    model = genai.GenerativeModel("gemini-1.5-flash")
    prompt = (
        "You are an expert on Indian cultural heritage. Analyze the supplied "
        "description and/or image of a cultural object or artefact. Return JSON "
        "with keys: possible_identification, art_form, region, period, history, "
        "significance, and related (array). State uncertainty when evidence is "
        "insufficient. Description: "
        + (query or "No text description provided.")
        + "\nReturn only valid JSON."
    )
    image_payload = decode_image(image_b64) if image_b64 else None
    response_parts = [prompt]
    if image_payload:
        response_parts.append(image_payload)

    resp = model.generate_content(response_parts)
    if not getattr(resp, "text", None):
        raise ValueError("The AI service returned an empty response.")
    return resp.text

@app.get("/health")
def health():
    return {"status": "ok", "ai": "gemini" if GEMINI_KEY else "heuristic"}

@app.post("/identify")
def identify(req: IdentifyRequest):
    query = (req.query or "").strip()
    if not query and not req.image_b64:
        return {"analysis": heuristic(""), "source": "heuristic"}

    if GEMINI_KEY:
        try:
            result = gemini(query, req.image_b64)
            return {"analysis": result, "source": "gemini"}
        except (ValueError, binascii.Error) as exc:
            return {"analysis": heuristic(query), "source": "heuristic-fallback", "message": str(exc)}
        except Exception:
            # Avoid returning provider details or configuration data to clients.
            return {"analysis": heuristic(query), "source": "gemini-fallback"}

    # Without Gemini, image bytes cannot be identified; use text only when supplied.
    if query:
        return {"analysis": heuristic(query), "source": "heuristic"}
    return {
        "analysis": {
            "possible_identification": "Image analysis unavailable",
            "art_form": "Unknown",
            "region": "Unknown",
            "period": "Unknown",
            "history": "Configure GEMINI_API_KEY to enable image analysis.",
            "significance": "Not available.",
            "confidence": 0,
            "related": [],
        },
        "source": "heuristic",
    }


@app.post("/describe")
def describe(req: DescribeRequest):
    query = (req.query or "").strip()
    if not query and not req.image_b64:
        return {"summary": "Provide a text description or image to analyze.", "traditions": [], "source": "heuristic"}

    if GEMINI_KEY:
        try:
            result = gemini(query, req.image_b64)
            return {"summary": result, "traditions": [], "source": "gemini"}
        except (ValueError, binascii.Error) as exc:
            return {"summary": str(exc), "traditions": [], "source": "heuristic-fallback"}
        except Exception:
            return {"summary": heuristic(query)["history"], "traditions": [], "source": "gemini-fallback"}

    result = heuristic(query)
    return {"summary": result["history"], "traditions": result["related"], "source": "heuristic"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
