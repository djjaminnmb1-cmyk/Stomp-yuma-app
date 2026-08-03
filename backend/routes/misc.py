"""Small static endpoints: venue info + API root."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/venue")
async def venue_info():
    return {
        "name": "Stompin' Ground Yuma",
        "tagline": "Yuma's home for country line dancing — all ages welcome!",
        "city": "Yuma, Arizona",
        "about": (
            "Stompin' Ground Yuma is a friendly community where dancers of every "
            "age and skill level come together to learn, laugh, and boot-scoot the "
            "night away. Grab your boots and let's dance."
        ),
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


@router.get("/")
async def root():
    return {"message": "Stompin' Ground Yuma API"}
