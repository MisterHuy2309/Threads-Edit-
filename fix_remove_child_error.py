import os

# 1. Thêm bản vá an toàn cho Node.prototype.removeChild & insertBefore vào page.tsx (Hot Reload ăn ngay không mất state)
page_path = os.path.join("frontend", "src", "app", "page.tsx")
with open(page_path, "r", encoding="utf-8") as f:
    p_code = f.read()

dom_patch = """  useEffect(() => {
    if (typeof Node === "function" && Node.prototype) {
      const originalRemoveChild = Node.prototype.removeChild;
      Node.prototype.removeChild = function <T extends Node>(child: T): T {
        if (child.parentNode !== this) {
          if (console) console.warn("Bỏ qua removeChild do Google Translate/Extension can thiệp DOM");
          return child;
        }
        return originalRemoveChild.apply(this, arguments as any) as T;
      };

      const originalInsertBefore = Node.prototype.insertBefore;
      Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
        if (referenceNode && referenceNode.parentNode !== this) {
          if (console) console.warn("Bỏ qua insertBefore do Google Translate/Extension can thiệp DOM");
          return newNode;
        }
        return originalInsertBefore.apply(this, arguments as any) as T;
      };
    }
    const handleErr = (event: ErrorEvent) => {"""

if "originalRemoveChild" not in p_code:
    p_code = p_code.replace("  useEffect(() => {\n    const handleErr = (event: ErrorEvent) => {", dom_patch)
    with open(page_path, "w", encoding="utf-8") as f:
        f.write(p_code)

# 2. Thêm translate="no" vào layout.tsx để ngăn Google Translate tự động phá cây DOM của React
layout_path = os.path.join("frontend", "src", "app", "layout.tsx")
if os.path.exists(layout_path):
    with open(layout_path, "r", encoding="utf-8") as f:
        l_code = f.read()
    if 'translate="no"' not in l_code:
        l_code = l_code.replace('<html lang="vi">', '<html lang="vi" translate="no" className="notranslate">')
        with open(layout_path, "w", encoding="utf-8") as f:
            f.write(l_code)

print(">>> ĐÃ VÁ TRIỆT ĐỂ LỖI removeChild / insertBefore DO GOOGLE TRANSLATE & EXTENSION GÂY RA!")
