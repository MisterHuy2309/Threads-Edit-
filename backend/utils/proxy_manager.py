import os
import random
from typing import Optional, List

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROXIES_FILE = os.path.join(BASE_DIR, "proxies.txt")

class ProxyManager:
    def __init__(self):
        self.proxies: List[str] = []
        self.load_proxies()

    def load_proxies(self):
        """Đọc danh sách proxy từ file proxies.txt"""
        if not os.path.exists(PROXIES_FILE):
            # Tạo file mẫu nếu chưa có
            with open(PROXIES_FILE, "w", encoding="utf-8") as f:
                f.write("# Thêm danh sách proxy vào đây, mỗi dòng một proxy\n")
                f.write("# Ví dụ: http://user:pass@123.45.67.89:8080\n")
                f.write("# Hoặc:  http://123.45.67.89:8080\n")
            self.proxies = []
            return

        with open(PROXIES_FILE, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip() and not line.startswith("#")]
        
        # Chuẩn hóa tiền tố http:// nếu người dùng quên nhập
        normalized = []
        for p in lines:
            if not p.startswith("http://") and not p.startswith("https://") and not p.startswith("socks5://"):
                normalized.append(f"http://{p}")
            else:
                normalized.append(p)
        self.proxies = normalized

    def get_proxy(self) -> Optional[str]:
        """Lấy ngẫu nhiên 1 proxy. Nếu danh sách trống, trả về None (dùng mạng gốc)"""
        self.load_proxies()
        if not self.proxies:
            return None
        return random.choice(self.proxies)

proxy_manager = ProxyManager()