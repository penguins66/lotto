"""엑셀(lotto.xlsx) → data/draws.json 1회성 변환 스크립트.

사용법: python scripts/import_excel.py <엑셀 경로>
열 순서: 회차, 번호1~6, 보너스, 1등 당첨금, 1등 당첨자수, 2등 당첨금, 2등 당첨자수
"""
import sys
from datetime import date, timedelta

import openpyxl

from common import FIRST_DRAW_DATE, save

def main(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    draws = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row[0]:
            continue
        r = int(row[0])
        draws.append({
            "r": r,
            "d": (FIRST_DRAW_DATE + timedelta(weeks=r - 1)).isoformat(),
            "n": sorted(int(x) for x in row[1:7]),
            "b": int(row[7]),
            "p1": int(row[8] or 0),
            "w1": int(row[9] or 0),
        })
    save(draws)
    print(f"{len(draws)}회 변환 완료")

if __name__ == "__main__":
    main(sys.argv[1])
