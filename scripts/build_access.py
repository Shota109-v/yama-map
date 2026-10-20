"""山へのアクセス（登山口・最寄り駅・駐車場）のデータを作る。

データはすべて OpenStreetMap。登山口の登録は全国で数百か所しかないため、
登山口が見つからない山は「山頂からの最寄り駅」を出す。距離はすべて直線距離。

出力: public/data/access.json（主要な山のみ。山の id ごと）
  {
    "<id>": {
      "t": [[登山口名, 緯度, 経度, 山頂からkm, 駅名, 駅の運営, 駅緯度, 駅経度, 駅からkm], ...],  # 登山口（最大3）
      "s": [[駅名, 運営, 緯度, 経度, 山頂からkm], ...],   # 登山口がないときの、山頂からの最寄り駅（最大2）
      "p": [[名前 or "", 緯度, 経度, 基準点からkm, 台数 or "", 料金 or ""], ...]  # 駐車場（最大3）
    }
  }

使い方:  python scripts/build_access.py   （取得したデータは scripts/.cache/ に保存し、2回目以降はそれを使う）
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_mountains import OUT_DIR, OVERPASS_URL, Grid, cached, distance_m, fetch, log  # noqa: E402

# 登山口を探す範囲（山頂から、m）
TRAILHEAD_RADIUS = 8000
# 駐車場を探す範囲（山頂から、m）と、登山口の近くとみなす距離
PARKING_RADIUS = 5000
PARKING_NEAR_TRAILHEAD = 1200
# 駐車場を一度に問い合わせる山の数
PARKING_CHUNK = 50

MAX_TRAILHEADS = 3
MAX_STATIONS = 2
MAX_PARKINGS = 3


def overpass(name: str, query: str) -> list[dict]:
    def load() -> bytes:
        log(f"  OSM 取得: {name}")
        data = fetch(OVERPASS_URL, {"data": query})
        time.sleep(10)  # 公開サーバーに負荷をかけすぎない
        return data

    return json.loads(cached(f"access-{name}.json", load))["elements"]


def point(el: dict) -> tuple[float, float] | None:
    """node なら座標、way / relation なら中心（out center で取得）"""
    if "lat" in el:
        return el["lat"], el["lon"]
    if "center" in el:
        return el["center"]["lat"], el["center"]["lon"]
    return None


def load_points(name: str, query: str) -> list[dict]:
    result = []
    for el in overpass(name, query):
        p = point(el)
        if not p:
            continue
        tags = el.get("tags", {})
        result.append({"lat": p[0], "lon": p[1], "tags": tags, "name": tags.get("name", "")})
    return result


def nearest(items: list[dict], grid: Grid, lat: float, lon: float, radius_cells: int, limit: int, max_m: float):
    found = []
    for it in grid.near(lat, lon, radius_cells=radius_cells):
        d = distance_m(lat, lon, it["lat"], it["lon"])
        if d <= max_m:
            found.append((d, it))
    found.sort(key=lambda x: x[0])
    # 同じ名前（同じ駅の別の出入口など）は1つにまとめる
    seen, result = set(), []
    for d, it in found:
        key = it["name"] or f"{it['lat']:.4f},{it['lon']:.4f}"
        if key in seen:
            continue
        seen.add(key)
        result.append((d, it))
        if len(result) >= limit:
            break
    return result


def km(m: float) -> float:
    return round(m / 1000, 1)


def station_label(st: dict) -> tuple[str, str]:
    name = st["name"]
    if name and not name.endswith("駅"):
        name += "駅"
    return name, st["tags"].get("operator", "")


def main() -> None:
    major = json.loads((OUT_DIR / "mountains-major.geojson").read_text(encoding="utf-8"))["features"]
    mountains = [
        {"id": f["properties"]["id"], "lat": f["geometry"]["coordinates"][1], "lon": f["geometry"]["coordinates"][0]}
        for f in major
    ]
    log(f"{len(mountains)}山のアクセス情報を作成")

    jp = 'area["ISO3166-1"="JP"][admin_level=2]->.a;'
    stations = load_points(
        "stations",
        f'[out:json][timeout:300];{jp}node["railway"="station"]["name"](area.a);out body;',
    )
    trailheads = load_points(
        "trailheads",
        f'[out:json][timeout:300];{jp}(nwr["highway"="trailhead"](area.a);nwr["name"~"登山口"](area.a););out center tags;',
    )
    # ケーブルカー・ロープウェイの山頂側の駅は「最寄り駅」としては紛らわしいので除く。
    # 種類のタグがない駅も多いので、名前（山頂・山上）でも判定する。ふもと側の駅は登山の起点になるので残す
    stations = [
        s for s in stations
        if s["tags"].get("station") not in ("funicular", "aerialway")
        and "aerialway" not in s["tags"]
        and not any(w in s["name"] for w in ("山頂", "山上"))
    ]
    log(f"  駅 {len(stations)}件、登山口 {len(trailheads)}件")

    # 駐車場は山の周りだけを、何回かに分けて問い合わせる
    parkings: list[dict] = []
    for i in range(0, len(mountains), PARKING_CHUNK):
        chunk = mountains[i : i + PARKING_CHUNK]
        parts = "".join(f'nwr["amenity"="parking"](around:{PARKING_RADIUS},{m["lat"]:.5f},{m["lon"]:.5f});' for m in chunk)
        parkings += load_points(f"parking-{i // PARKING_CHUNK:03d}", f"[out:json][timeout:300];({parts});out center tags;")
    # 範囲が重なった分を除く
    parkings = list({(round(p["lat"], 5), round(p["lon"], 5)): p for p in parkings}.values())
    log(f"  駐車場 {len(parkings)}件")

    station_grid, trailhead_grid, parking_grid = Grid(stations), Grid(trailheads), Grid(parkings)

    access: dict[str, dict] = {}
    with_trailhead = 0
    for m in mountains:
        entry: dict[str, list] = {}

        ths = nearest(trailheads, trailhead_grid, m["lat"], m["lon"], 1, MAX_TRAILHEADS, TRAILHEAD_RADIUS)
        if ths:
            with_trailhead += 1
            entry["t"] = []
            for d, th in ths:
                st = nearest(stations, station_grid, th["lat"], th["lon"], 6, 1, 80000)
                if st:
                    sd, s = st[0]
                    sname, sop = station_label(s)
                    entry["t"].append([th["name"] or "登山口", round(th["lat"], 5), round(th["lon"], 5), km(d),
                                       sname, sop, round(s["lat"], 5), round(s["lon"], 5), km(sd)])
                else:
                    entry["t"].append([th["name"] or "登山口", round(th["lat"], 5), round(th["lon"], 5), km(d),
                                       "", "", 0, 0, 0])
        else:
            sts = nearest(stations, station_grid, m["lat"], m["lon"], 6, MAX_STATIONS, 80000)
            entry["s"] = []
            for d, s in sts:
                sname, sop = station_label(s)
                entry["s"].append([sname, sop, round(s["lat"], 5), round(s["lon"], 5), km(d)])

        # 駐車場：登山口の近くにあればそれを、なければ山頂に近いものを出す
        refs = [(th[1], th[2]) for th in entry.get("t", [])]
        candidates: list[tuple[float, dict]] = []
        for lat, lon in refs:
            candidates += nearest(parkings, parking_grid, lat, lon, 1, MAX_PARKINGS, PARKING_NEAR_TRAILHEAD)
        if not candidates:
            candidates = nearest(parkings, parking_grid, m["lat"], m["lon"], 1, MAX_PARKINGS, PARKING_RADIUS)
        candidates.sort(key=lambda x: x[0])
        seen = set()
        entry["p"] = []
        for d, p in candidates:
            key = (round(p["lat"], 4), round(p["lon"], 4))
            if key in seen:
                continue
            seen.add(key)
            t = p["tags"]
            entry["p"].append([p["name"], round(p["lat"], 5), round(p["lon"], 5), km(d), t.get("capacity", ""), t.get("fee", "")])
            if len(entry["p"]) >= MAX_PARKINGS:
                break

        access[m["id"]] = entry

    path = OUT_DIR / "access.json"
    path.write_text(json.dumps(access, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    with_parking = sum(1 for e in access.values() if e["p"])
    log(f"{path.name}: 登山口あり {with_trailhead}山、駐車場あり {with_parking}山、{path.stat().st_size / 1024:.0f}KB")


if __name__ == "__main__":
    main()
