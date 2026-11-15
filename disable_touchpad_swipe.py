import os

css_path = os.path.join("frontend", "src", "app", "globals.css")
with open(css_path, "r", encoding="utf-8") as f:
    css = f.read()

rule = """
/* CHẶN VUỐT 2 NGÓN TOUCHPAD BACK/FORWARD TRANG WEB */
html, body {
  overscroll-behavior-x: none !important;
  overscroll-behavior-y: none !important;
}
"""

if "overscroll-behavior-x" not in css:
    css = css + "\n" + rule
    with open(css_path, "w", encoding="utf-8") as f:
        f.write(css)

print(">>> ĐÃ CHẶN VUỐT TOUCHPAD BACK/FORWARD TRONG globals.css (KHÔNG MẤT DỮ LIỆU ĐANG THIẾT KẾ)!")
