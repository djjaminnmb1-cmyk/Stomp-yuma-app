"""Audit difficulty (skill level) of every dance currently in the DB.

Uses Claude Sonnet 4.6 via the Emergent LLM key to compare the stored
difficulty against what the wider line-dance community typically labels
each dance as.

Output:
  /app/memory/dance_difficulty_report.md
  /app/memory/dance_difficulty_raw.json
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

BATCH_SIZE = 30
SYSTEM = (
    "You audit line-dance skill-level labels. Community consensus (CopperKnob, "
    "BootStepper, choreographers' own labels) is the ground truth. Only judge "
    "when you're confident from that consensus — otherwise mark unknown."
)

PROMPT_TMPL = """Audit the recorded difficulty for each of these {n} line dances.
Allowed levels: Beginner, Improver, Intermediate, Advanced.

For each row return one of:
- "correct"       — level matches community consensus
- "too_easy"      — should be harder
- "too_hard"      — should be easier
- "unknown"       — you don't know this dance well enough

Return ONLY a JSON array of objects (no prose, no markdown):
{{
  "id": "<id>",
  "verdict": "<one of the above>",
  "suggested_level": "Beginner|Improver|Intermediate|Advanced",  // only for too_easy / too_hard
  "confidence": "high" | "medium" | "low"
}}

Records:
{payload}"""


async def main(limit: int | None):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    cur = db.dances.find({}, {"_id": 0, "id": 1, "name": 1, "choreographer": 1,
                              "difficulty": 1, "bpm": 1, "count": 1})
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
                    "current_level": d.get("difficulty", ""),
                    "bpm": d.get("bpm"),
                    "count": d.get("count", ""),
                }
                for d in batch
            ],
            indent=2,
        )
        chat = LlmChat(
            api_key=API_KEY,
            session_id=f"dance-diff-{i}",
            system_message=SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-6")
        try:
            reply = await chat.send_message(
                UserMessage(text=PROMPT_TMPL.format(n=len(batch), payload=payload))
            )
        except Exception as e:
            print(f"  batch {i} error: {e}")
            continue
        text = reply if isinstance(reply, str) else str(reply)
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

    by_id = {d["id"]: d for d in dances}
    buckets = {"correct": [], "too_easy": [], "too_hard": [], "unknown": []}
    for v in all_verdicts:
        d = by_id.get(v.get("id"))
        if not d:
            continue
        b = v.get("verdict", "").strip()
        if b in buckets:
            buckets[b].append({**d, **v})

    Path("/app/memory").mkdir(exist_ok=True)
    lines = [
        f"# Dance difficulty audit ({len(all_verdicts)} audited)",
        "",
        f"- `correct`   : **{len(buckets['correct'])}** — level matches consensus",
        f"- `too_easy`  : **{len(buckets['too_easy'])}** — should be harder",
        f"- `too_hard`  : **{len(buckets['too_hard'])}** — should be easier",
        f"- `unknown`   : **{len(buckets['unknown'])}** — LLM couldn't judge",
        "",
    ]

    def _table(section: str, rows: list[dict]) -> list[str]:
        out = [f"## {section} ({len(rows)})", ""]
        if not rows:
            out += ["_None._", ""]
            return out
        out += [
            "| Dance | Choreographer | Current | Suggested | Confidence |",
            "|---|---|---|---|---|",
        ]
        for r in sorted(rows, key=lambda x: x.get("name", "").lower()):
            out.append(
                f"| {r.get('name','')} | {r.get('choreographer','')} | "
                f"{r.get('difficulty','')} | {r.get('suggested_level','')} | "
                f"{r.get('confidence','')} |"
            )
        out.append("")
        return out

    lines += _table("Too easy — recommend raising", buckets["too_easy"])
    lines += _table("Too hard — recommend lowering", buckets["too_hard"])
    lines += _table("Unknown (LLM couldn't judge)", buckets["unknown"])

    Path("/app/memory/dance_difficulty_report.md").write_text("\n".join(lines) + "\n")
    Path("/app/memory/dance_difficulty_raw.json").write_text(
        json.dumps(all_verdicts, indent=2)
    )
    print("\nWrote /app/memory/dance_difficulty_report.md")
    print(f"  correct={len(buckets['correct'])} too_easy={len(buckets['too_easy'])} "
          f"too_hard={len(buckets['too_hard'])} unknown={len(buckets['unknown'])}")


if __name__ == "__main__":
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    asyncio.run(main(limit))
