"""최신 회차를 받아 data/draws.json에 추가한다. (GitHub Actions가 매주 실행)

1순위: 동행복권 공식 API, 실패 시 2순위: 공개 미러(smok95/lotto).
새 회차가 없으면 아무것도 바꾸지 않는다.
"""
import json
import sys
import urllib.request

from common import load, save

OFFICIAL = "https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd={}"
MIRROR = "https://smok95.github.io/lotto/results/{}.json"
UA = {"User-Agent": "Mozilla/5.0 (lotto-generator updater)"}

def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode("utf-8"))

def from_official(r):
    items = get_json(OFFICIAL.format(r))["data"]["list"]
    if not items:
        return None
    x = items[0]
    ymd = x["ltRflYmd"]
    return {
        "r": int(x["ltEpsd"]),
        "d": f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:]}",
        "n": sorted(int(x[f"tm{i}WnNo"]) for i in range(1, 7)),
        "b": int(x["bnsWnNo"]),
        "p1": int(x["rnk1WnAmt"]),
        "w1": int(x["rnk1WnNope"]),
    }

def from_mirror(r):
    try:
        x = get_json(MIRROR.format(r))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    first = x["divisions"][0] if x.get("divisions") else {}
    return {
        "r": int(x["draw_no"]),
        "d": x["date"][:10],
        "n": sorted(int(n) for n in x["numbers"]),
        "b": int(x["bonus_no"]),
        "p1": int(first.get("prize", 0)),
        "w1": int(first.get("winners", 0)),
    }

def fetch(r):
    errors = []
    for source in (from_official, from_mirror):
        try:
            draw = source(r)
            if draw is None or draw["r"] == r:
                return draw
            errors.append(f"{source.__name__}: 회차 불일치 {draw['r']}")
        except Exception as e:  # 소스 하나가 막혀도 다음 소스로
            errors.append(f"{source.__name__}: {e}")
    raise RuntimeError(f"{r}회 조회 실패 - " + " / ".join(errors))

def main():
    draws = load()
    added = []
    while True:
        r = draws[-1]["r"] + 1
        draw = fetch(r)
        if draw is None:
            break
        draws.append(draw)
        added.append(r)
    if added:
        save(draws)
        print(f"추가된 회차: {added}")
    else:
        print(f"새 회차 없음 (최신 {draws[-1]['r']}회)")

if __name__ == "__main__":
    sys.exit(main())
