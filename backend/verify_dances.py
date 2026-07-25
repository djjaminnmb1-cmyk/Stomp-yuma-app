"""Verify dance-to-song mappings against LLM knowledge.

Batch-checks every dance in the DB by asking Claude Sonnet 4.6 whether the
recorded (name, choreographer, song, artist) tuple is plausible for a real
line dance. The model returns JSON flags for:
  - wrong_song: song doesn't match this dance
  - wrong_choreographer: choreographer doesn't match
  - generic_song: song is a placeholder like "Various" or "Any country track"
  - unknown_dance: model doesn't recognise the dance (obscure, doesn't imply wrong)
  - looks_correct: entry looks fine

Output: /app/memory/dance_verification_report.md
"""
import asyncio, json, os, re, sys
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv("/app/backend/.env")

API_KEY = os.environ["EMERGENT_LLM_KEY"]
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")

BATCH_SIZE = 25
SYSTEM = (
    "You are a line dance metadata auditor with deep familiarity with "
    "CopperKnob, BootStepper, and the international line dance community. "
    "You receive small batches of dance records and must judge whether the "
    "song attribution is plausible for each dance. Never invent choreographers "
    "or songs; if you don't know a dance, mark it as unknown, not wrong."
)

PROMPT_TMPL = """Audit the following {n} line dance records. For each record,
decide one of these verdicts:

- "looks_correct"     — you recognise this dance and the song/choreographer match
- "wrong_song"        — you recognise this dance and the recorded song is wrong
- "wrong_choreographer" — you recognise the dance but the choreographer looks wrong
- "generic_song"      — the song field is a placeholder ("Various", "Any 4/4 country track", "Country track", etc.) instead of a specific title
- "unknown_dance"     — you do not recognise this dance well enough to judge

Return ONLY a JSON array (no prose, no markdown) of objects with:
{{
  "id": "<the id from input>",
  "verdict": "<one of the above>",
  "suggestion": "<optional: correct song, choreographer, or dance name — omit if verdict is looks_correct or unknown_dance>",
  "confidence": "high" | "medium" | "low"
}}

Records to audit:
{payload}"""


async def main(limit: int | None):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    cur = db.dances.find({}, {"_id": 0, "id": 1, "name": 1, "choreographer": 1,
                              "song": 1, "artist": 1})
    dances = await cur.to_list(10000)
    if limit:
        dances = dances[:limit]
    print(f"Auditing {len(dances)} dances in batches of {BATCH_SIZE}...")

    all_verdicts: list[dict] = []
    for i in range(0, len(dances), BATCH_SIZE):
        batch = dances[i : i + BATCH_SIZE]
        payload = json.dumps(
            [
                {
                    "id": d["id"],
                    "dance_name": d.get("name", ""),
                    "choreographer": d.get("choreographer", ""),
                    "song": d.get("song", ""),
                    "artist": d.get("artist", ""),
                }
                for d in batch
            ],
            indent=2,
        )
        chat = LlmChat(
            api_key=API_KEY,
            session_id=f"dance-audit-{i}",
            system_message=SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-6")
        msg = UserMessage(text=PROMPT_TMPL.format(n=len(batch), payload=payload))
        try:
            reply = await chat.send_message(msg)
        except Exception as e:
            print(f"  batch {i} error: {e}")
            continue
        text = reply if isinstance(reply, str) else str(reply)
        # Strip any accidental markdown fences
        m = re.search(r"\[.*\]", text, re.S)
        if not m:
            print(f"  batch {i}: no JSON array in reply")
            continue
        try:
            arr = json.loads(m.group(0))
        except Exception as e:
            print(f"  batch {i}: JSON decode failed: {e}")
            continue
        all_verdicts.extend(arr)
        print(f"  batch {i // BATCH_SIZE + 1}/{(len(dances) - 1) // BATCH_SIZE + 1}: got {len(arr)} verdicts")

    # Merge back
    by_id = {d["id"]: d for d in dances}
    problems = {"wrong_song": [], "wrong_choreographer": [], "generic_song": [], "unknown_dance": []}
    ok = 0
    for v in all_verdicts:
        did = v.get("id")
        d = by_id.get(did)
        if not d:
            continue
        verdict = v.get("verdict", "").strip()
        if verdict == "looks_correct":
            ok += 1
        elif verdict in problems:
            problems[verdict].append({**d, **v})

    # Write report
    Path("/app/memory").mkdir(exist_ok=True)
    lines = [
        f"# Dance verification report ({len(all_verdicts)} audited)",
        "",
        f"- `looks_correct`      : **{ok}**",
        f"- `wrong_song`         : **{len(problems['wrong_song'])}**  ← needs fixing",
        f"- `wrong_choreographer`: **{len(problems['wrong_choreographer'])}**  ← needs fixing",
        f"- `generic_song`       : **{len(problems['generic_song'])}**  ← placeholder",
        f"- `unknown_dance`      : **{len(problems['unknown_dance'])}**  ← too obscure to judge",
        "",
    ]

    def _table(section: str, rows: list[dict]) -> list[str]:
        out = [f"## {section} ({len(rows)})", ""]
        if not rows:
            out += ["_None._", ""]
            return out
        out += [
            "| Dance | Choreographer | Current song / artist | LLM suggestion | Confidence |",
            "|---|---|---|---|---|",
        ]
        for r in sorted(rows, key=lambda x: x.get("name", "").lower()):
            sugg = (r.get("suggestion") or "").replace("|", "/")
            out.append(
                f"| {r.get('name','')} | {r.get('choreographer','')} | "
                f"{r.get('song','')} — {r.get('artist','')} | {sugg} | "
                f"{r.get('confidence','')} |"
            )
        out.append("")
        return out

    lines += _table("Wrong song", problems["wrong_song"])
    lines += _table("Wrong choreographer", problems["wrong_choreographer"])
    lines += _table("Generic / placeholder song", problems["generic_song"])
    lines += _table("Unknown dance (LLM couldn't verify)", problems["unknown_dance"])

    Path("/app/memory/dance_verification_report.md").write_text("\n".join(lines) + "\n")
    print(f"\nWrote /app/memory/dance_verification_report.md")
    print(f"  ok={ok}  wrong_song={len(problems['wrong_song'])}  "
          f"wrong_choreographer={len(problems['wrong_choreographer'])}  "
          f"generic_song={len(problems['generic_song'])}  "
          f"unknown={len(problems['unknown_dance'])}")

    # Also dump raw verdicts for later programmatic fixes
    Path("/app/memory/dance_verification_raw.json").write_text(
        json.dumps(all_verdicts, indent=2)
    )
    print(f"  Raw verdicts: /app/memory/dance_verification_raw.json")


if __name__ == "__main__":
    limit = None
    if len(sys.argv) > 1:
        limit = int(sys.argv[1])
    asyncio.run(main(limit))
