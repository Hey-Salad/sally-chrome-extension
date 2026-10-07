from pathlib import Path
import math
import subprocess

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "store-assets" / "chrome-store"
FRAMES = OUT / "video-frames"
ICON = ROOT / "store-assets" / "sally-chrome-store-icon-128.png"

RED = "#ed1c24"
CORAL = "#f24b4c"
PEACH = "#ffd0cd"
INK = "#111827"
MUTED = "#667085"
LINE = "#e5e7eb"
CREAM = "#fff8ef"
GREEN = "#16a34a"
BLUE = "#2563eb"


def font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def text(draw, xy, value, size=28, fill=INK, bold=False, anchor=None, align="left"):
    draw.text(xy, value, font=font(size, bold), fill=fill, anchor=anchor, align=align)


def wrap(draw, value, width, size=28, bold=False):
    words = value.split()
    lines = []
    current = ""
    f = font(size, bold)
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=f)[2] <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return "\n".join(lines)


def rounded(draw, box, radius=24, fill="white", outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def paste_icon(img, xy, size=44):
    icon = Image.open(ICON).convert("RGBA").resize((size, size), Image.LANCZOS)
    img.paste(icon, xy, icon)


def check(draw, cx, cy, r=14):
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=GREEN)
    draw.line((cx - 7, cy, cx - 1, cy + 6, cx + 9, cy - 8), fill="white", width=4)


def product_card(draw, x, y, title, price, color, added=False):
    rounded(draw, (x, y, x + 170, y + 220), 18, "white", LINE, 1)
    rounded(draw, (x + 22, y + 24, x + 148, y + 120), 16, color)
    text(draw, (x + 18, y + 140), wrap(draw, title, 135, 18, True), 18, INK, True)
    text(draw, (x + 18, y + 190), price, 24, INK, True)
    if added:
        rounded(draw, (x + 80, y + 180, x + 154, y + 210), 15, "#dcfce7")
        text(draw, (x + 117, y + 195), "Added", 15, GREEN, True, "mm")


def browser_shell(draw):
    draw.rectangle((0, 0, 1280, 800), fill="#f3f4f6")
    draw.rectangle((0, 0, 1280, 64), fill="#3b3d46")
    for i, c in enumerate(["#ff5f57", "#febc2e", "#28c840"]):
        draw.ellipse((22 + i * 24, 22, 36 + i * 24, 36), fill=c)
    rounded(draw, (120, 14, 880, 50), 18, "#262932")
    text(draw, (145, 32), "ocado.com/search?q=weekly+shop", 18, "#d1d5db", anchor="lm")


def supermarket(draw):
    draw.rectangle((0, 64, 820, 800), fill="#f8fafc")
    text(draw, (42, 120), "ocado", 48, "#542078", True)
    rounded(draw, (220, 92, 610, 144), 18, "white", LINE, 1)
    text(draw, (245, 118), "Search groceries", 22, MUTED, anchor="lm")
    rounded(draw, (640, 92, 770, 144), 18, "#efe7f8")
    text(draw, (705, 118), "Trolley", 20, "#35105a", True, "mm")
    draw.rectangle((0, 168, 820, 220), fill="#ffe58f")
    text(draw, (42, 194), "Save time on your repeat shop", 24, INK, True, anchor="lm")
    for idx, (title, price, color, added) in enumerate([
        ("Organic bananas", "£1.60", "#facc15", True),
        ("British milk", "£1.65", "#bfdbfe", True),
        ("Seeded bread", "£1.45", "#fed7aa", False),
        ("Free range eggs", "£2.70", "#fde68a", False),
    ]):
        product_card(draw, 44 + idx * 190, 270, title, price, color, added)
    for idx, (title, price, color, added) in enumerate([
        ("Cherry tomatoes", "£2.10", "#fecaca", True),
        ("Chicken thighs", "£4.80", "#fee2e2", False),
        ("Greek yoghurt", "£2.25", "#e0f2fe", True),
    ]):
        product_card(draw, 44 + idx * 190, 520, title, price, color, added)


def side_panel(draw, mode):
    rounded(draw, (840, 86, 1246, 770), 28, "white", "#d1d5db", 2)
    paste_icon(draw.im if False else base_img, (866, 112), 40)
    text(draw, (914, 132), "Sally by HeySalad®", 24, INK, True, anchor="lm")
    draw.line((840, 166, 1246, 166), fill=LINE, width=2)
    if mode == "chat":
        text(draw, (1043, 248), "What should Sally\nhelp with?", 31, INK, True, "mm", "center")
        text(draw, (1043, 326), "Ask a question, plan a list,\nor paste groceries.", 21, MUTED, anchor="mm", align="center")
        bubble(draw, 900, 402, "Plan a quick weekly shop with fruit, lunches, and cleaning supplies.", mine=True)
        bubble(draw, 880, 530, "I can build that. I’ll group it into produce, lunches, household, and repeat items.", mine=False)
    elif mode == "cart":
        text(draw, (882, 220), "Reusable cart", 32, INK, True)
        text(draw, (882, 258), "Weekly household shop", 22, MUTED)
        rows = [("Bananas", "2 packs", "£3.20"), ("Milk", "2", "£3.30"), ("Bread", "1", "£1.45"), ("Eggs", "12", "£2.70")]
        for i, row in enumerate(rows):
            y = 310 + i * 72
            rounded(draw, (880, y, 1210, y + 54), 18, CREAM)
            check(draw, 908, y + 27, 12)
            text(draw, (936, y + 20), row[0], 20, INK, True)
            text(draw, (936, y + 42), row[1], 16, MUTED)
            text(draw, (1192, y + 27), row[2], 20, INK, True, "rm")
        rounded(draw, (880, 630, 1210, 698), 24, RED)
        text(draw, (1045, 664), "Run shopping task", 24, "white", True, "mm")
    elif mode == "progress":
        rounded(draw, (878, 204, 1212, 610), 26, "#fff9e6", LINE)
        rounded(draw, (906, 232, 1036, 274), 21, RED)
        text(draw, (971, 253), "SHOPPING", 18, "white", True, "mm")
        text(draw, (906, 314), "Shopping at Ocado", 30, INK, True)
        text(draw, (906, 362), "18/24 items", 25, "#475467", True)
        text(draw, (1194, 362), "£42.80", 30, INK, True, "rm")
        rounded(draw, (906, 392, 1194, 408), 8, "#fee2e2")
        rounded(draw, (906, 392, 1122, 408), 8, RED)
        for i, item in enumerate(["Bananas", "Milk", "Bread", "Tomatoes"]):
            y = 440 + i * 36
            check(draw, 922, y, 10)
            text(draw, (946, y), item, 18, INK, True, "lm")
            text(draw, (1192, y), f"£{[1.6,1.65,1.45,2.1][i]:.2f}", 18, INK, True, "rm")
    elif mode == "recipe":
        text(draw, (1043, 226), "Recipe found", 34, INK, True, "mm")
        text(draw, (1043, 272), "Turn this page into a shopping task.", 22, MUTED, anchor="mm")
        for i, item in enumerate(["minced beef", "potatoes", "carrots", "stock", "peas"]):
            rounded(draw, (906, 334 + i * 52, 1180, 374 + i * 52), 18, CREAM)
            text(draw, (930, 354 + i * 52), item, 20, INK, True, "lm")
        rounded(draw, (906, 642, 1180, 704), 24, RED)
        text(draw, (1043, 673), "Build cart", 24, "white", True, "mm")
    else:
        text(draw, (1043, 226), "Repeat workflows", 34, INK, True, "mm")
        text(draw, (1043, 272), "Save routines for households, creators,\noffices, and assistants.", 22, MUTED, anchor="mm", align="center")
        for i, item in enumerate(["Office snacks", "Airbnb restock", "Recipe creator shop"]):
            rounded(draw, (900, 348 + i * 76, 1188, 408 + i * 76), 20, CREAM, LINE)
            text(draw, (928, 378 + i * 76), item, 21, INK, True, "lm")
            text(draw, (1168, 378 + i * 76), "Run", 18, RED, True, "rm")


def bubble(draw, x, y, value, mine=False):
    w, h = 310, 104
    fill = INK if mine else RED
    rounded(draw, (x, y, x + w, y + h), 28, fill)
    text(draw, (x + 24, y + 22), wrap(draw, value, w - 48, 18, True), 18, "white", True)


def screenshot(filename, title, subtitle, mode):
    global base_img
    base_img = Image.new("RGB", (1280, 800), "#ffffff")
    draw = ImageDraw.Draw(base_img)
    browser_shell(draw)
    supermarket(draw)
    side_panel(draw, mode)
    rounded(draw, (42, 704, 760, 766), 26, PEACH)
    text(draw, (72, 735), title, 26, INK, True, "lm")
    text(draw, (500, 735), subtitle, 20, "#475467", anchor="lm")
    base_img.save(OUT / filename)


def promo_tile():
    img = Image.new("RGB", (440, 280), PEACH)
    draw = ImageDraw.Draw(img)
    rounded(draw, (24, 24, 416, 256), 34, "white")
    paste_icon(img, (54, 54), 68)
    text(draw, (136, 78), "Sally", 36, INK, True, "lm")
    text(draw, (136, 116), "by HeySalad®", 18, INK, True, "lm")
    text(draw, (54, 170), "Save time on\nrepeat shopping", 31, INK, True)
    rounded(draw, (284, 178, 386, 222), 22, RED)
    text(draw, (335, 200), "AI tool", 17, "white", True, "mm")
    img.save(OUT / "small-promo-tile-440x280.png")


def marquee():
    img = Image.new("RGB", (1400, 560), PEACH)
    draw = ImageDraw.Draw(img)
    paste_icon(img, (72, 70), 78)
    text(draw, (168, 102), "Sally by HeySalad®", 40, INK, True, "lm")
    text(draw, (72, 190), "Save time on\nrepeat shopping", 68, INK, True)
    text(draw, (72, 360), "Chat, plan lists, build reusable carts,\nand run shopping tasks from Chrome.", 27, "#344054")
    rounded(draw, (72, 438, 308, 498), 30, RED)
    text(draw, (190, 468), "Run shopping tasks", 22, "white", True, "mm")
    rounded(draw, (770, 58, 1328, 512), 34, "white", "#f4b9b6", 2)
    # mini panel inside marquee
    rounded(draw, (822, 116, 1276, 456), 28, "#fffdfb", LINE)
    text(draw, (868, 166), "Weekly office restock", 31, INK, True)
    text(draw, (868, 210), "18/24 items • £42.80 so far", 24, MUTED)
    rounded(draw, (868, 250, 1230, 266), 8, "#fee2e2")
    rounded(draw, (868, 250, 1140, 266), 8, RED)
    for i, item in enumerate(["Milk", "Coffee", "Fruit", "Cleaning supplies"]):
        y = 314 + i * 42
        check(draw, 888, y, 10)
        text(draw, (914, y), item, 21, INK, True, "lm")
    img.save(OUT / "marquee-promo-tile-1400x560.png")


def video_frames():
    FRAMES.mkdir(parents=True, exist_ok=True)
    slides = [
        ("Save time on repeat shopping", "Chat with Sally to plan lists and build carts."),
        ("Run shopping as a task", "Sally searches, matches, and adds items in your browser."),
        ("Built for repeat workflows", "Households, creators, assistants, offices, and businesses."),
        ("Sally by HeySalad®", "Making shopping effortless."),
    ]
    for idx, (headline, sub) in enumerate(slides):
        for frame in range(60):
            img = Image.new("RGB", (1920, 1080), PEACH)
            draw = ImageDraw.Draw(img)
            offset = int(18 * math.sin(frame / 60 * math.pi))
            paste_icon(img, (130, 132), 96)
            text(draw, (250, 180), "Sally by HeySalad®", 44, INK, True, "lm")
            text(draw, (130, 405 - offset), headline, 86, INK, True)
            text(draw, (134, 540 - offset), sub, 40, "#344054")
            rounded(draw, (132, 690, 475, 772), 40, RED)
            text(draw, (303, 731), "Chrome extension", 30, "white", True, "mm")
            rounded(draw, (1120, 156, 1740, 920), 44, "white", "#f4b9b6", 2)
            text(draw, (1200, 250), ["Chat", "Shopping task", "Reusable carts", "Ready to ship"][idx], 52, INK, True)
            for i in range(5):
                y = 360 + i * 86
                rounded(draw, (1200, y, 1660, y + 58), 24, CREAM)
                if i < idx + 2:
                    check(draw, 1234, y + 29, 13)
                label = ["Plan groceries", "Build list", "Match products", "Add to cart", "Track progress"][i]
                text(draw, (1268, y + 29), label, 28, INK, True, "lm")
            img.save(FRAMES / f"frame_{idx * 60 + frame:04d}.png")


def make_video():
    video_frames()
    out = OUT / "global-promo-video.mp4"
    cmd = [
        "ffmpeg", "-y", "-framerate", "30",
        "-i", str(FRAMES / "frame_%04d.png"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(out),
    ]
    subprocess.run(cmd, check=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    screenshot("screenshot-1-chat-planning-1280x800.png", "Save time on repeat shopping", "Start with chat, not forms.", "chat")
    screenshot("screenshot-2-build-reusable-carts-1280x800.png", "Build reusable carts", "Turn routines and lists into repeatable shopping.", "cart")
    screenshot("screenshot-3-shopping-progress-1280x800.png", "Track every shopping task", "See items, issues, cost, and progress.", "progress")
    screenshot("screenshot-4-recipe-to-cart-1280x800.png", "Turn recipes into carts", "Creator content and meal plans become shopping lists.", "recipe")
    screenshot("screenshot-5-repeat-workflows-1280x800.png", "Useful for people and teams", "Households, creators, assistants, offices, and businesses.", "workflow")
    promo_tile()
    marquee()
    make_video()


if __name__ == "__main__":
    main()
