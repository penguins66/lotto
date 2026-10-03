import json
from datetime import date, datetime, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "draws.json"
FIRST_DRAW_DATE = date(2002, 12, 7)

def load():
    return json.loads(DATA.read_text(encoding="utf-8"))["draws"]

def save(draws):
    draws = sorted(draws, key=lambda d: d["r"])
    rounds = [d["r"] for d in draws]
    if rounds != list(range(1, len(rounds) + 1)):
        raise ValueError("회차가 1부터 연속되지 않습니다")
    for d in draws:
        if len(set(d["n"])) != 6 or not all(1 <= x <= 45 for x in d["n"] + [d["b"]]):
            raise ValueError(f"{d['r']}회 번호가 올바르지 않습니다: {d}")
    body = {
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "draws": draws,
    }
    # 한 회차당 한 줄: diff가 읽기 쉽고 파일도 작게 유지
    lines = ",\n".join(json.dumps(d, ensure_ascii=False, separators=(",", ":")) for d in draws)
    DATA.write_text(
        '{"updated":"%s","draws":[\n%s\n]}\n' % (body["updated"], lines), encoding="utf-8", newline="\n"
    )
