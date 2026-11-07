import os
import time
import asyncio
import aiohttp
from typing import List, Optional, Tuple

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROXIES_FILE = os.path.join(BASE_DIR, "proxies.txt")

_PROXIES_CACHE: Tuple[float, List[Optional[str]]] = (0.0, [])
CACHE_TTL_SECONDS = 300

TEST_TARGET_URL = "https://speech.platform.bing.com"

GITHUB_PROXY_SOURCES = [
    "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt",
    "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
    "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt"
]

async def fetch_proxies_from_github(limit: int = 120) -> List[str]:
    collected: List[str] = []
    timeout = aiohttp.ClientTimeout(total=5)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        for source_url in GITHUB_PROXY_SOURCES:
            try:
                async with session.get(source_url) as resp:
                    if resp.status == 200:
                        content = await resp.text()
                        for line in content.splitlines():
                            item = line.strip()
                            if item and not item.startswith("#"):
                                p = item if item.startswith("http") else f"http://{item}"
                                if p not in collected:
                                    collected.append(p)
                                if len(collected) >= limit:
                                    break
                        if len(collected) >= 40:
                            break
            except Exception:
                pass
    return collected

async def check_single_proxy(proxy: Optional[str], timeout_sec: float = 1.5) -> Tuple[Optional[str], bool, float]:
    start_time = time.time()
    try:
        timeout = aiohttp.ClientTimeout(total=timeout_sec)
        connector = aiohttp.TCPConnector(ssl=False)
        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            async with session.get(TEST_TARGET_URL, proxy=proxy, ssl=False) as resp:
                if resp.status < 500:
                    latency = (time.time() - start_time) * 1000
                    return (proxy, True, latency)
    except Exception:
        pass
    return (proxy, False, 99999.0)

def overwrite_proxies_file(alive_external_proxies: List[str]):
    try:
        lines = ["# Danh sach proxy song nhanh", "direct"]
        lines.extend(alive_external_proxies)
        with open(PROXIES_FILE, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        print(f"[Proxy Cleaner] Da luu {len(alive_external_proxies)} proxy nhanh vao proxies.txt!")
    except Exception as e:
        print(f"[Proxy Cleaner] Loi: {e}")

async def get_alive_proxies(force_refresh: bool = False) -> List[Optional[str]]:
    global _PROXIES_CACHE
    now = time.time()

    if not force_refresh and _PROXIES_CACHE[1] and (now - _PROXIES_CACHE[0] < CACHE_TTL_SECONDS):
        return _PROXIES_CACHE[1]

    raw_list: List[Optional[str]] = [None]

    if os.path.exists(PROXIES_FILE):
        try:
            with open(PROXIES_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    p = line.strip()
                    if not p or p.startswith("#") or p.lower() == "direct":
                        continue
                    if not p.startswith("http://") and not p.startswith("https://"):
                        p = f"http://{p}"
                    if p not in raw_list:
                        raw_list.append(p)
        except Exception:
            pass

    tasks = [check_single_proxy(p) for p in raw_list]
    results = await asyncio.gather(*tasks)

    alive_proxies_with_ping = [res for res in results if res[1]]
    external_alive = [res[0] for res in alive_proxies_with_ping if res[0] is not None]

    # Nếu còn ít hơn 3 proxy, quét thêm proxy tốc độ cao
    if len(external_alive) < 3:
        print("[Proxy Checker] Dang quet them proxy nhanh tu GitHub...")
        scraped = await fetch_proxies_from_github(limit=80)
        if scraped:
            scrape_tasks = [check_single_proxy(p, timeout_sec=1.5) for p in scraped]
            scrape_results = await asyncio.gather(*scrape_tasks)
            for res in scrape_results:
                if res[1] and res[0] and res[0] not in external_alive:
                    alive_proxies_with_ping.append(res)
                    external_alive.append(res[0])
                    if len(external_alive) >= 6:
                        break

    alive_proxies_with_ping.sort(key=lambda x: x[2])
    overwrite_proxies_file(external_alive)

    sorted_alive = [p for p, _, _ in alive_proxies_with_ping]
    if not sorted_alive:
        sorted_alive = [None]

    _PROXIES_CACHE = (now, sorted_alive)
    return sorted_alive