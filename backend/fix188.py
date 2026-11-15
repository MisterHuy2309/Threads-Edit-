with open("routers/video.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

with open("routers/video.py", "w", encoding="utf-8") as f:
    for line in lines:
        if "decoded.split" in line and "replace" in line:
            f.write('    clean = decoded.split("?")[0].replace(chr(92), "/")\n')
        else:
            f.write(line)

print(">>> DA SUA XONG DONG 188 THANH CONG!")
