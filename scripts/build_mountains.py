"""山のデータを作る。

- 主要な山：国土地理院「日本の主な山岳標高」（約1,000山）
- その他の山：OpenStreetMap の natural=peak / natural=volcano（名前があるもの）
- 都道府県の判定：地球地図日本（国土地理院）の都道府県界（dataofjapan/land で GeoJSON 化されたもの）

出力（public/data/）:
- mountains-major.geojson … 主要な山。最初に読み込む
- mountains-other.geojson … その他の山。拡大したときと検索で使う

使い方:  python scripts/build_mountains.py
取得したデータは scripts/.cache/ に保存し、2回目以降はそれを使う（--refresh で取り直す）。
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "scripts" / ".cache"
OUT_DIR = ROOT / "public" / "data"

GSI_CSV_URL = "https://www.gsi.go.jp/KOKUJYOHO/MOUNTAIN/1003zan20260331.csv"
PREFECTURE_BOUNDARY_URL = "https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson"
WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"

WIKIPEDIA_API_URL = "https://ja.wikipedia.org/w/api.php"

# 日本百名山は Wikidata の項目から取る（100山そろっている）
WIKIDATA_HYAKU = "Q1156761"
# 日本三百名山のうち百名山以外の200山は、Wikipedia の一覧（座標・標高つき）から取る。
# Wikidata には一部の山しか登録されていないため。
# 二百名山の荒沢岳は三百名山には含まれないので除く（三百名山 = 百名山100 + 二百名山99 + 三百名山101）
WIKIPEDIA_LISTS = {
    "日本二百名山": {"荒沢岳"},
    "日本三百名山": set(),
}
# Wikidata の山名と地理院の山名が違うもの
FAMOUS_ALIASES = {
    "那須岳": "茶臼岳",
    "大台ヶ原山": "日出ヶ岳",
    "大峰山": "八経ヶ岳",  # 百名山の大峰山は最高峰の八経ヶ岳（山上ヶ岳ではない）
}
# Wikidata の座標が大きくずれているもの（山頂の座標で上書きする）
FAMOUS_COORD_FIXES = {
    "白山": (36.155063, 136.771449),  # 御前峰
}
# 同じ名前の山を探す距離と、名前が違っても同じ山とみなす距離
FAMOUS_NAME_METERS = 15000
FAMOUS_NEAR_METERS = 1000
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "yama-map-data-builder/0.1 (personal use; https://github.com/Shota109-v/yama-map)"

# OSM から取得する範囲（南, 西, 北, 東）。公開サーバーの負担を抑えるため、数回に分けて取得する
OSM_REGIONS = {
    "north": (38.0, 138.0, 46.0, 149.0),  # 北海道・東北北部
    "central": (34.0, 134.0, 38.0, 142.0),  # 東北南部・関東・中部・近畿
    "chugoku": (34.0, 128.0, 37.0, 134.0),  # 中国・対馬
    "kyushu-shikoku": (30.0, 128.0, 34.0, 134.0),  # 九州・四国
    "pacific": (24.0, 134.0, 34.0, 143.0),  # 紀伊半島南部・伊豆諸島・小笠原
    "ryukyu": (24.0, 122.0, 30.0, 132.0),  # 南西諸島
}

# OSM の山が主要な山と同じものかを判定する距離
SAME_PEAK_METERS = 300
SAME_NAME_METERS = 1500
# 都道府県界の外（海岸線が粗いため）に出た山は、この距離内の主要な山の都道府県にする
PREF_FALLBACK_METERS = 30000

REFRESH = "--refresh" in sys.argv


def log(msg: str) -> None:
    print(msg, flush=True)


def ssl_context_for(url: str) -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    # 国土地理院のサーバーは古い TLS 再ネゴシエーションを使うため、このサーバーに限って許可する
    # （証明書の検証はそのまま行う）
    if urllib.parse.urlparse(url).hostname == "www.gsi.go.jp":
        ctx.options |= ssl.OP_LEGACY_SERVER_CONNECT
    return ctx


def fetch(url: str, data: dict | None = None) -> bytes:
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
    wait = 30
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=400, context=ssl_context_for(url)) as res:
                return res.read()
        except urllib.error.HTTPError as e:
            # 混雑時は待ち時間を倍にしながらやり直す
            if e.code in (429, 502, 503, 504) and attempt < 5:
                log(f"  HTTP {e.code}、{wait}秒待って再試行")
                time.sleep(wait)
                wait *= 2
                continue
            raise
    raise RuntimeError("unreachable")


def cached(name: str, loader) -> bytes:
    path = CACHE_DIR / name
    if path.exists() and not REFRESH:
        return path.read_bytes()
    data = loader()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return data


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def kata_to_hira(s: str) -> str:
    # 「ヵ」「ヶ」はひらがなに対応する一般的な文字がないので変換しない
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヴ" else c for c in s)


def parse_ele(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return round(float(value.replace("m", "").replace(",", "").strip()))
    except ValueError:
        return None


class Grid:
    """近くの点だけを素早く探すための、0.1度ごとのマス目"""

    def __init__(self, items: list[dict]):
        self.cells: dict[tuple[int, int], list[dict]] = {}
        for m in items:
            self.cells.setdefault(self._key(m["lat"], m["lon"]), []).append(m)

    @staticmethod
    def _key(lat: float, lon: float) -> tuple[int, int]:
        return int(lat * 10), int(lon * 10)

    def near(self, lat: float, lon: float, radius_cells: int = 1):
        ky, kx = self._key(lat, lon)
        for dy in range(-radius_cells, radius_cells + 1):
            for dx in range(-radius_cells, radius_cells + 1):
                yield from self.cells.get((ky + dy, kx + dx), [])


# ---------- 主要な山 ----------


def load_major() -> list[dict]:
    raw = cached("gsi-1003zan.csv", lambda: fetch(GSI_CSV_URL))
    rows = csv.DictReader(io.StringIO(raw.decode("cp932")))
    mountains = []
    for row in rows:
        mountains.append({
            "id": f"gsi-{row['連番']}",
            "name": row["山名＜山頂名＞"].strip(),
            "yomi": row["山名よみ＜山頂名よみ＞"].strip(),
            "ele": parse_ele(row["標高値(m)"]),
            "pref": row["都道府県"].strip(),
            "lat": float(row["緯度"]),
            "lon": float(row["経度"]),
        })
    return mountains


# ---------- 都道府県の判定 ----------


def load_prefecture_polygons() -> list[tuple[str, tuple[float, float, float, float], list]]:
    """(都道府県名, 外接矩形, 多角形の一覧) のリストを返す"""
    raw = cached("japan-prefectures.geojson", lambda: fetch(PREFECTURE_BOUNDARY_URL))
    result = []
    for f in json.loads(raw)["features"]:
        geom = f["geometry"]
        polygons = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polygons:
            xs = [p[0] for p in poly[0]]
            ys = [p[1] for p in poly[0]]
            result.append((f["properties"]["nam_ja"], (min(xs), min(ys), max(xs), max(ys)), poly))
    return result


def point_in_ring(x: float, y: float, ring: list) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def find_prefecture(lat: float, lon: float, polygons, major_grid: Grid) -> str | None:
    for name, (x0, y0, x1, y1), poly in polygons:
        if x0 <= lon <= x1 and y0 <= lat <= y1 and point_in_ring(lon, lat, poly[0]):
            if not any(point_in_ring(lon, lat, hole) for hole in poly[1:]):
                return name
    # 海岸線の近くで判定できなかった場合は、近くの主要な山の都道府県を使う
    best, best_d = None, PREF_FALLBACK_METERS
    for m in major_grid.near(lat, lon, radius_cells=3):
        d = distance_m(lat, lon, m["lat"], m["lon"])
        if d < best_d:
            best, best_d = m["pref"].split()[0], d
    return best


# ---------- その他の山（OpenStreetMap） ----------


def load_osm_region(key: str, bbox: tuple[float, float, float, float]) -> list[dict]:
    s, w, n, e = bbox
    query = f"""
    [out:json][timeout:300];
    node["natural"~"^(peak|volcano)$"]["name"]({s},{w},{n},{e});
    out body;
    """

    def load() -> bytes:
        log(f"  OSM 取得: {key}")
        data = fetch(OVERPASS_URL, {"data": query})
        time.sleep(10)  # 公開サーバーに負荷をかけすぎない
        return data

    elements = json.loads(cached(f"osm-region-{key}.json", load))["elements"]
    peaks = []
    for el in elements:
        tags = el.get("tags", {})
        yomi = tags.get("name:ja-Hira") or kata_to_hira(
            tags.get("name:ja-Kana") or tags.get("name:ja_kana") or ""
        )
        peaks.append({
            "id": f"osm-{el['id']}",
            "name": tags["name"].strip(),
            "yomi": yomi,
            "ele": parse_ele(tags.get("ele")),
            "lat": el["lat"],
            "lon": el["lon"],
        })
    return peaks


def is_same_as_major(p: dict, major_grid: Grid) -> bool:
    for m in major_grid.near(p["lat"], p["lon"], radius_cells=2):
        d = distance_m(p["lat"], p["lon"], m["lat"], m["lon"])
        if d < SAME_PEAK_METERS:
            return True
        if d < SAME_NAME_METERS and (p["name"] in m["name"] or m["name"] in p["name"]):
            return True
    return False


def build_others(major: list[dict]) -> list[dict]:
    major_grid = Grid(major)
    polygons = load_prefecture_polygons()

    seen: set[str] = set()
    result = []
    dropped_outside = 0
    for key, bbox in OSM_REGIONS.items():
        for p in load_osm_region(key, bbox):
            # 範囲の重なりによる重複と、主要な山と同じ山頂を除く
            if p["id"] in seen or is_same_as_major(p, major_grid):
                continue
            seen.add(p["id"])
            pref = find_prefecture(p["lat"], p["lon"], polygons, major_grid)
            if pref is None:
                dropped_outside += 1  # 日本の外（取得範囲に入った近隣国など）
                continue
            p["pref"] = pref
            result.append(p)
    log(f"  日本の外として除外: {dropped_outside}件")
    # 標高の高い順に並べておく
    result.sort(key=lambda m: -(m["ele"] or 0))
    return result


# ---------- 百名山・二百名山・三百名山 ----------


def load_hyakumeizan() -> list[dict]:
    """日本百名山（Wikidata）。[{name, rank: 1, coords: [(lat, lon), ...]}]"""
    query = f"""
    SELECT ?m ?mLabel ?coord WHERE {{
      ?m wdt:P361 wd:{WIKIDATA_HYAKU} .
      OPTIONAL {{ ?m wdt:P625 ?coord . }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "ja". }}
    }}
    """
    url = f"{WIKIDATA_SPARQL_URL}?format=json&query={urllib.parse.quote(query)}"
    rows = json.loads(cached("wikidata-hyakumeizan.json", lambda: fetch(url)))["results"]["bindings"]

    items: dict[str, dict] = {}
    for r in rows:
        qid = r["m"]["value"].rsplit("/", 1)[1]
        it = items.setdefault(qid, {"name": r["mLabel"]["value"], "rank": 1, "coords": []})
        if "coord" in r:
            lon, lat = map(float, r["coord"]["value"].removeprefix("Point(").removesuffix(")").split())
            it["coords"].append((lat, lon))
    for it in items.values():
        if it["name"] in FAMOUS_COORD_FIXES:
            it["coords"] = [FAMOUS_COORD_FIXES[it["name"]]]
    return list(items.values())


# Wikipedia の山岳一覧の1行：「山名/よ:み[/記事名],経度/緯度,画像,標高,都道府県[/都道府県]」
WIKI_ROW = re.compile(r"^\s*([^,\n/{}|]+)/([^,\n/]*)[^,\n]*,([\d.]+)/([\d.]+),[^,\n]*,(\d+),([^\n]+)$", re.M)


def load_sanbyakumeizan() -> list[dict]:
    """日本三百名山のうち百名山以外の200山（Wikipedia）。座標・標高・都道府県つき"""
    items = []
    for page, excluded in WIKIPEDIA_LISTS.items():
        params = {"action": "parse", "page": page, "prop": "wikitext", "format": "json", "formatversion": "2"}
        url = f"{WIKIPEDIA_API_URL}?{urllib.parse.urlencode(params)}"
        text = json.loads(cached(f"wikipedia-{page}.json", lambda: fetch(url)))["parse"]["wikitext"]
        rows = WIKI_ROW.findall(text)
        log(f"  {page}: {len(rows)}山")
        for name, yomi, lon, lat, ele, pref in rows:
            name = name.split("（")[0].strip()
            if name in excluded:
                continue
            items.append({
                "name": name,
                "rank": 2,
                "coords": [(float(lat), float(lon))],
                "yomi": yomi.replace(":", ""),
                "ele": int(ele),
                "pref": pref.strip().replace("/", " "),
            })
    return items


def base_name(name: str) -> str:
    """「白山＜御前峰＞」→「白山」"""
    return name.split("＜")[0].split("(")[0].strip()


def assign_famous_ranks(famous: list[dict], major: list[dict], others: list[dict]) -> list[dict]:
    """
    百名山などに当たる山に rank をつける。主要な山から探し、なければその他の山から探す。
    どちらにもなかった名山を返す
    """
    for pool in (major, others):
        grid = Grid(pool)
        remaining = []
        for it in famous:
            name = FAMOUS_ALIASES.get(it["name"], it["name"])
            best: tuple[float, dict] | None = None
            for lat, lon in it["coords"]:
                for m in grid.near(lat, lon, radius_cells=2):
                    d = distance_m(lat, lon, m["lat"], m["lon"])
                    mname = base_name(m["name"])
                    same_name = name in m["name"] or mname in name
                    if (same_name and d < FAMOUS_NAME_METERS) or d < FAMOUS_NEAR_METERS:
                        # 名前が合う山を優先し、その中で近いものを選ぶ
                        score = d if same_name else d + FAMOUS_NAME_METERS
                        if best is None or score < best[0]:
                            best = (score, m)
            if best:
                m = best[1]
                m["rank"] = min(m.get("rank", 9), it["rank"])
            else:
                remaining.append(it)
        famous = remaining
    return famous


# ---------- 出力 ----------


def to_geojson(mountains: list[dict]) -> dict:
    features = []
    for m in mountains:
        props = {"id": m["id"], "name": m["name"], "pref": m["pref"]}
        if m["yomi"]:
            props["yomi"] = m["yomi"]
        if m["ele"] is not None:
            props["ele"] = m["ele"]
        if "rank" in m:
            props["rank"] = m["rank"]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(m["lon"], 5), round(m["lat"], 5)]},
            "properties": props,
        })
    return {"type": "FeatureCollection", "features": features}


def write(name: str, mountains: list[dict]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    path.write_text(
        json.dumps(to_geojson(mountains), ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    log(f"{path.relative_to(ROOT)}: {len(mountains)}件, {path.stat().st_size / 1024:.0f}KB")


def main() -> None:
    log("国土地理院の主要な山を読み込み中")
    major = load_major()

    log("OpenStreetMap の山を読み込み中")
    others = build_others(major)

    log("百名山・三百名山を読み込み中")
    unmatched = assign_famous_ranks(load_hyakumeizan() + load_sanbyakumeizan(), major, others)
    # どのデータにもなかった名山は、Wikipedia の座標で山を足す（百名山は座標が粗いので足さない）
    for it in unmatched:
        if it["rank"] == 1:
            log(f"  対応する山が見つからなかった百名山: {it['name']}")
            continue
        lat, lon = it["coords"][0]
        major.append({
            "id": f"wiki-{it['name']}",
            "name": it["name"],
            "yomi": it["yomi"],
            "ele": it["ele"],
            "pref": it["pref"],
            "lat": lat,
            "lon": lon,
            "rank": 2,
        })
        log(f"  Wikipedia の座標で追加: {it['name']}（{it['pref']}）")
    for rank, label in ((1, "百名山"), (2, "三百名山（百名山以外）")):
        n_major = sum(1 for m in major if m.get("rank") == rank)
        n_other = sum(1 for m in others if m.get("rank") == rank)
        log(f"  {label}: 主要な山 {n_major}件 + その他の山 {n_other}件")

    # 名山に当たるその他の山は、広域でも表示されるよう主要な山のファイルに移す
    major += [m for m in others if "rank" in m]
    others = [m for m in others if "rank" not in m]

    write("mountains-major.geojson", major)
    write("mountains-other.geojson", others)


if __name__ == "__main__":
    main()
