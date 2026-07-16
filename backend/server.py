from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import bcrypt
import jwt as pyjwt
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get("JWT_SECRET", "stompin-yuma-secret-change-me")
JWT_ALG = "HS256"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@stompinground.com").lower()

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ---------------- Models ----------------
class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    is_admin: bool = False
    auth_provider: str = "email"


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionIn(BaseModel):
    session_id: str


class DanceIn(BaseModel):
    name: str
    choreographer: str
    song: str
    artist: Optional[str] = ""
    difficulty: str  # Beginner / Improver / Intermediate / Advanced
    bpm: Optional[int] = None
    count: Optional[str] = None  # e.g. "32 count, 4 wall"
    youtube_url: Optional[str] = ""
    description: Optional[str] = ""
    tags: Optional[List[str]] = []


class DanceOut(DanceIn):
    id: str
    created_at: str


class TrackingIn(BaseModel):
    status: str  # completed | wishlist
    rating: Optional[int] = 0  # 0..5
    notes: Optional[str] = ""


class TrackingOut(BaseModel):
    dance_id: str
    status: str
    rating: int
    notes: str
    updated_at: str


class SuggestionIn(BaseModel):
    dance_name: str
    song: Optional[str] = ""
    artist: Optional[str] = ""
    difficulty: Optional[str] = ""
    youtube_url: Optional[str] = ""
    notes: Optional[str] = ""


# ---------------- Helpers ----------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def make_jwt(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
        "iat": datetime.now(timezone.utc),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def upsert_user(email: str, name: str, picture: str = "", provider: str = "email",
                      password_hash: Optional[str] = None) -> dict:
    email = email.lower().strip()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        updates = {"name": name or existing.get("name", email)}
        if picture:
            updates["picture"] = picture
        if password_hash:
            updates["password_hash"] = password_hash
        await db.users.update_one({"email": email}, {"$set": updates})
        existing.update(updates)
        return existing
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": email,
        "name": name or email.split("@")[0],
        "picture": picture,
        "is_admin": email == ADMIN_EMAIL,
        "auth_provider": provider,
        "password_hash": password_hash or "",
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.split(" ", 1)[1].strip()

    # 1) Try Emergent session token (stored in DB)
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if sess:
        expires = sess.get("expires_at")
        if isinstance(expires, datetime):
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires < datetime.now(timezone.utc):
                raise HTTPException(401, "Session expired")
        user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(401, "User not found")
        return user

    # 2) Try JWT
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user = await db.users.find_one({"user_id": payload["user_id"]},
                                       {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(401, "User not found")
        return user
    except pyjwt.PyJWTError:
        raise HTTPException(401, "Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin only")
    return user


def user_to_out(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "picture": u.get("picture", ""),
        "is_admin": bool(u.get("is_admin")),
        "auth_provider": u.get("auth_provider", "email"),
    }


def dance_to_out(d: dict) -> dict:
    return {
        "id": d["id"],
        "name": d.get("name", ""),
        "choreographer": d.get("choreographer", ""),
        "song": d.get("song", ""),
        "artist": d.get("artist", ""),
        "difficulty": d.get("difficulty", "Beginner"),
        "bpm": d.get("bpm"),
        "count": d.get("count", ""),
        "youtube_url": d.get("youtube_url", ""),
        "description": d.get("description", ""),
        "tags": d.get("tags", []),
        "created_at": d.get("created_at", ""),
    }


# ---------------- Auth Routes ----------------
@api_router.post("/auth/register")
async def register(inp: RegisterIn):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing and existing.get("password_hash"):
        raise HTTPException(400, "Email already registered")
    user = await upsert_user(inp.email, inp.name, provider="email",
                             password_hash=hash_password(inp.password))
    token = make_jwt(user["user_id"])
    return {"token": token, "user": user_to_out(user)}


@api_router.post("/auth/login")
async def login(inp: LoginIn):
    user = await db.users.find_one({"email": inp.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(401, "Invalid credentials")
    if not verify_password(inp.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = make_jwt(user["user_id"])
    return {"token": token, "user": user_to_out(user)}


@api_router.post("/auth/google-session")
async def google_session(inp: GoogleSessionIn):
    async with httpx.AsyncClient(timeout=15) as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": inp.session_id},
        )
        if r.status_code != 200:
            raise HTTPException(401, "Invalid Google session")
        data = r.json()
    email = data.get("email", "").lower()
    if not email:
        raise HTTPException(401, "No email in session")
    user = await upsert_user(email, data.get("name", ""),
                             picture=data.get("picture", ""), provider="google")
    session_token = data.get("session_token")
    if session_token:
        await db.user_sessions.insert_one({
            "session_token": session_token,
            "user_id": user["user_id"],
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        })
        return {"token": session_token, "user": user_to_out(user)}
    # Fallback JWT
    return {"token": make_jwt(user["user_id"]), "user": user_to_out(user)}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user_to_out(user)


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------------- Dance Routes ----------------
@api_router.get("/dances")
async def list_dances(q: Optional[str] = None, difficulty: Optional[str] = None):
    query: dict = {}
    if difficulty and difficulty.lower() != "all":
        query["difficulty"] = difficulty
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"choreographer": {"$regex": q, "$options": "i"}},
            {"song": {"$regex": q, "$options": "i"}},
            {"artist": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.dances.find(query, {"_id": 0}).sort("name", 1).to_list(1000)
    return [dance_to_out(d) for d in docs]


@api_router.get("/dances/{dance_id}")
async def get_dance(dance_id: str):
    d = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    return dance_to_out(d)


@api_router.post("/dances")
async def create_dance(inp: DanceIn, admin: dict = Depends(require_admin)):
    doc = inp.dict()
    doc["id"] = f"dance_{uuid.uuid4().hex[:10]}"
    doc["created_at"] = now_iso()
    await db.dances.insert_one(doc)
    doc.pop("_id", None)
    return dance_to_out(doc)


@api_router.put("/dances/{dance_id}")
async def update_dance(dance_id: str, inp: DanceIn, admin: dict = Depends(require_admin)):
    await db.dances.update_one({"id": dance_id}, {"$set": inp.dict()})
    d = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    return dance_to_out(d)


@api_router.delete("/dances/{dance_id}")
async def delete_dance(dance_id: str, admin: dict = Depends(require_admin)):
    await db.dances.delete_one({"id": dance_id})
    return {"ok": True}


# ---------------- Tracking Routes ----------------
@api_router.get("/tracking/me")
async def my_tracking(user: dict = Depends(get_current_user)):
    docs = await db.tracking.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(2000)
    return [
        {
            "dance_id": d["dance_id"],
            "status": d.get("status", "wishlist"),
            "rating": d.get("rating", 0),
            "notes": d.get("notes", ""),
            "updated_at": d.get("updated_at", ""),
        }
        for d in docs
    ]


@api_router.post("/tracking/{dance_id}")
async def upsert_tracking(dance_id: str, inp: TrackingIn, user: dict = Depends(get_current_user)):
    if inp.status not in ("completed", "wishlist"):
        raise HTTPException(400, "Invalid status")
    dance = await db.dances.find_one({"id": dance_id}, {"_id": 0})
    if not dance:
        raise HTTPException(404, "Dance not found")
    payload = {
        "user_id": user["user_id"],
        "dance_id": dance_id,
        "status": inp.status,
        "rating": max(0, min(5, int(inp.rating or 0))),
        "notes": inp.notes or "",
        "updated_at": now_iso(),
    }
    await db.tracking.update_one(
        {"user_id": user["user_id"], "dance_id": dance_id},
        {"$set": payload},
        upsert=True,
    )
    return {
        "dance_id": dance_id,
        "status": payload["status"],
        "rating": payload["rating"],
        "notes": payload["notes"],
        "updated_at": payload["updated_at"],
    }


@api_router.delete("/tracking/{dance_id}")
async def delete_tracking(dance_id: str, user: dict = Depends(get_current_user)):
    await db.tracking.delete_one({"user_id": user["user_id"], "dance_id": dance_id})
    return {"ok": True}


# ---------------- Suggestions Routes ----------------
@api_router.post("/suggestions")
async def submit_suggestion(inp: SuggestionIn, user: dict = Depends(get_current_user)):
    if not inp.dance_name or not inp.dance_name.strip():
        raise HTTPException(400, "Dance name is required")
    doc = {
        "id": f"sug_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "user_name": user.get("name", ""),
        "user_email": user.get("email", ""),
        "dance_name": inp.dance_name.strip(),
        "song": (inp.song or "").strip(),
        "artist": (inp.artist or "").strip(),
        "difficulty": (inp.difficulty or "").strip(),
        "youtube_url": (inp.youtube_url or "").strip(),
        "notes": (inp.notes or "").strip(),
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.suggestions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/suggestions/mine")
async def my_suggestions(user: dict = Depends(get_current_user)):
    docs = await db.suggestions.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return docs


@api_router.get("/suggestions")
async def list_suggestions(admin: dict = Depends(require_admin)):
    docs = await db.suggestions.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api_router.put("/suggestions/{sug_id}/status")
async def update_suggestion_status(
    sug_id: str, status: str, admin: dict = Depends(require_admin)
):
    if status not in ("pending", "reviewed", "queued", "declined"):
        raise HTTPException(400, "Invalid status")
    await db.suggestions.update_one({"id": sug_id}, {"$set": {"status": status}})
    d = await db.suggestions.find_one({"id": sug_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    return d


@api_router.delete("/suggestions/{sug_id}")
async def delete_suggestion(sug_id: str, user: dict = Depends(get_current_user)):
    # Owner can delete their own; admin can delete any
    doc = await db.suggestions.find_one({"id": sug_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if doc["user_id"] != user["user_id"] and not user.get("is_admin"):
        raise HTTPException(403, "Not allowed")
    await db.suggestions.delete_one({"id": sug_id})
    return {"ok": True}


# ---------------- Venue Info ----------------
@api_router.get("/venue")
async def venue_info():
    return {
        "name": "Stompin' Ground Yuma",
        "tagline": "Yuma's home for country line dancing — all ages welcome!",
        "city": "Yuma, Arizona",
        "about": ("Stompin' Ground Yuma is a friendly community where dancers of every "
                  "age and skill level come together to learn, laugh, and boot-scoot the "
                  "night away. Grab your boots and let's dance."),
        "instructor": {
            "name": "Erin Brown",
            "role": "Line Dance Instructor",
        },
        "contact": {
            "phone": "",
            "email": "",
            "address": "Yuma, AZ",
        },
    }


@api_router.get("/")
async def root():
    return {"message": "Stompin' Ground Yuma API"}


# ---------------- Seed ----------------
SEED_DANCES = [
    ("Watermelon Crawl", "Sue Lipscomb", "Watermelon Crawl", "Tracy Byrd", "Beginner", 96, "32 count, 4 wall", "https://www.youtube.com/results?search_query=watermelon+crawl+line+dance"),
    ("Cowboy Cha Cha", "Traditional", "Neon Moon", "Brooks & Dunn", "Beginner", 100, "Partner", "https://www.youtube.com/results?search_query=cowboy+cha+cha"),
    ("Electric Slide", "Ric Silver", "Electric Boogie", "Marcia Griffiths", "Beginner", 118, "18 count, 4 wall", "https://www.youtube.com/results?search_query=electric+slide"),
    ("Boot Scootin' Boogie", "Bill Bader", "Boot Scootin' Boogie", "Brooks & Dunn", "Beginner", 128, "32 count, 4 wall", "https://www.youtube.com/results?search_query=boot+scootin+boogie+line+dance"),
    ("Tush Push", "Jim Ferrazzano", "Tush Push", "Various", "Improver", 120, "40 count, 4 wall", "https://www.youtube.com/results?search_query=tush+push+line+dance"),
    ("Cotton Eye Joe", "Traditional", "Cotton Eye Joe", "Rednex", "Beginner", 140, "16 count, 4 wall", "https://www.youtube.com/results?search_query=cotton+eye+joe+line+dance"),
    ("Copperhead Road", "Traditional", "Copperhead Road", "Steve Earle", "Improver", 138, "36 count, 4 wall", "https://www.youtube.com/results?search_query=copperhead+road+line+dance"),
    ("Wagon Wheel Rock", "Michele Perron", "Wagon Wheel", "Darius Rucker", "Beginner", 148, "32 count, 4 wall", "https://www.youtube.com/results?search_query=wagon+wheel+rock+line+dance"),
    ("Cupid Shuffle", "Cupid", "Cupid Shuffle", "Cupid", "Beginner", 120, "32 count, 4 wall", "https://www.youtube.com/results?search_query=cupid+shuffle"),
    ("Cha Cha Slide", "DJ Casper", "Cha Cha Slide", "DJ Casper", "Beginner", 120, "Guided", "https://www.youtube.com/results?search_query=cha+cha+slide"),
    ("Achy Breaky Heart", "Melanie Greenwood", "Achy Breaky Heart", "Billy Ray Cyrus", "Beginner", 120, "32 count, 4 wall", "https://www.youtube.com/results?search_query=achy+breaky+heart+line+dance"),
    ("Country Girl Shake", "Rachael McEnaney", "Country Girl (Shake It For Me)", "Luke Bryan", "Improver", 128, "32 count, 4 wall", "https://www.youtube.com/results?search_query=country+girl+shake+line+dance"),
    ("Cruise", "Rob Fowler", "Cruise", "Florida Georgia Line", "Improver", 128, "48 count, 4 wall", "https://www.youtube.com/results?search_query=cruise+line+dance"),
    ("Footloose", "Various", "Footloose", "Kenny Loggins", "Improver", 130, "32 count, 4 wall", "https://www.youtube.com/results?search_query=footloose+line+dance"),
    ("Chattahoochee", "Traditional", "Chattahoochee", "Alan Jackson", "Improver", 140, "48 count, 2 wall", "https://www.youtube.com/results?search_query=chattahoochee+line+dance"),
    ("Redneck Girl", "Traditional", "Redneck Girl", "The Bellamy Brothers", "Beginner", 110, "40 count, 4 wall", "https://www.youtube.com/results?search_query=redneck+girl+line+dance"),
    ("Slap Leather", "Gayle Brandon", "Slap Leather", "Various", "Improver", 118, "40 count, 4 wall", "https://www.youtube.com/results?search_query=slap+leather+line+dance"),
    ("Two-Step Around The Christmas Tree", "Traditional", "Rockin' Around The Christmas Tree", "Brenda Lee", "Beginner", 132, "32 count, 4 wall", "https://www.youtube.com/results?search_query=two+step+christmas+line+dance"),
    ("The Git Up", "Various", "The Git Up", "Blanco Brown", "Beginner", 92, "32 count, 4 wall", "https://www.youtube.com/results?search_query=the+git+up+line+dance"),
    ("Old Town Road", "Various", "Old Town Road", "Lil Nas X", "Beginner", 136, "32 count, 4 wall", "https://www.youtube.com/results?search_query=old+town+road+line+dance"),
    ("Meant To Be", "Rachael McEnaney", "Meant To Be", "Bebe Rexha & FGL", "Beginner", 130, "32 count, 4 wall", "https://www.youtube.com/results?search_query=meant+to+be+line+dance"),
    ("Body Like a Back Road", "Ira Weisburd", "Body Like a Back Road", "Sam Hunt", "Beginner", 106, "32 count, 4 wall", "https://www.youtube.com/results?search_query=body+like+back+road+line+dance"),
    ("Whiskey On My Breath", "Karl-Harry Winson", "Whiskey On My Breath", "Love and Theft", "Intermediate", 132, "64 count, 2 wall", "https://www.youtube.com/results?search_query=whiskey+on+my+breath+line+dance"),
    ("Bosa Nova", "Rob Fowler", "Various", "Various", "Intermediate", 116, "48 count, 4 wall", "https://www.youtube.com/results?search_query=bosa+nova+line+dance"),
    ("Neon Cowgirl", "Guyton Mundy", "Neon Cowgirl", "Dan + Shay", "Intermediate", 126, "32 count, 4 wall", "https://www.youtube.com/results?search_query=neon+cowgirl+line+dance"),
    ("Hurricane", "Guyton Mundy", "Hurricane", "Luke Combs", "Intermediate", 148, "32 count, 4 wall", "https://www.youtube.com/results?search_query=hurricane+line+dance"),
    ("Fake ID", "Rachael McEnaney", "Fake ID", "Big & Rich", "Improver", 130, "32 count, 4 wall", "https://www.youtube.com/results?search_query=fake+id+line+dance"),
    ("Save a Horse", "Traditional", "Save A Horse (Ride A Cowboy)", "Big & Rich", "Improver", 130, "48 count, 2 wall", "https://www.youtube.com/results?search_query=save+a+horse+line+dance"),
    ("Man! I Feel Like a Woman", "Max Perry", "Man! I Feel Like a Woman", "Shania Twain", "Improver", 124, "32 count, 4 wall", "https://www.youtube.com/results?search_query=man+i+feel+like+a+woman+line+dance"),
    ("God Blessed Texas", "Traditional", "God Blessed Texas", "Little Texas", "Improver", 138, "32 count, 4 wall", "https://www.youtube.com/results?search_query=god+blessed+texas+line+dance"),
    ("Trashy Women", "Traditional", "Trashy Women", "Confederate Railroad", "Improver", 128, "32 count, 4 wall", "https://www.youtube.com/results?search_query=trashy+women+line+dance"),
    ("She's Country", "Rachael McEnaney", "She's Country", "Jason Aldean", "Intermediate", 140, "64 count, 4 wall", "https://www.youtube.com/results?search_query=shes+country+line+dance"),
    ("Whiskey River", "Various", "Whiskey River", "Willie Nelson", "Beginner", 116, "32 count, 4 wall", "https://www.youtube.com/results?search_query=whiskey+river+line+dance"),
    ("Alan's 6", "Alan Birchall", "Various", "Various", "Intermediate", 128, "32 count, 4 wall", "https://www.youtube.com/results?search_query=alan+6+line+dance"),
    ("Amame", "Rachael McEnaney", "Amame", "Various", "Intermediate", 100, "64 count, 4 wall", "https://www.youtube.com/results?search_query=amame+line+dance"),
    ("Get Down Country", "Guyton Mundy", "Get Down Country", "Various", "Improver", 130, "32 count, 4 wall", "https://www.youtube.com/results?search_query=get+down+country+line+dance"),
    ("Ten Toes", "Michele Perron", "Ten Toes", "Various", "Beginner", 108, "32 count, 4 wall", "https://www.youtube.com/results?search_query=ten+toes+line+dance"),
    ("Wobble", "V.I.C.", "Wobble", "V.I.C.", "Beginner", 130, "32 count, 4 wall", "https://www.youtube.com/results?search_query=wobble+line+dance"),
    ("Redneck Rodeo", "Rob Fowler", "Redneck Rodeo", "Various", "Improver", 130, "32 count, 4 wall", "https://www.youtube.com/results?search_query=redneck+rodeo+line+dance"),
    ("Lose Control", "Sobrielo Mario", "Lose Control", "Meduza", "Advanced", 124, "32 count, 4 wall", "https://www.youtube.com/results?search_query=lose+control+line+dance"),
]


@app.on_event("startup")
async def startup():
    # Indexes
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.dances.create_index("name")
        await db.tracking.create_index([("user_id", 1), ("dance_id", 1)], unique=True)
    except Exception as e:
        logger.warning(f"Index issue: {e}")

    # Seed dances if empty
    count = await db.dances.count_documents({})
    if count == 0:
        docs = []
        for (name, chor, song, artist, diff, bpm, cnt, yt) in SEED_DANCES:
            docs.append({
                "id": f"dance_{uuid.uuid4().hex[:10]}",
                "name": name,
                "choreographer": chor,
                "song": song,
                "artist": artist,
                "difficulty": diff,
                "bpm": bpm,
                "count": cnt,
                "youtube_url": yt,
                "description": "",
                "tags": [],
                "created_at": now_iso(),
            })
        await db.dances.insert_many(docs)
        logger.info(f"Seeded {len(docs)} dances")

    # Seed admin user if not exists
    existing_admin = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing_admin:
        await upsert_user(
            ADMIN_EMAIL, "Stompin' Admin",
            provider="email",
            password_hash=hash_password("Admin123!"),
        )
        logger.info(f"Seeded admin user: {ADMIN_EMAIL}")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
