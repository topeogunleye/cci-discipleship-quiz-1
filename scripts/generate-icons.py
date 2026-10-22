#!/usr/bin/env python3
"""
Deterministic icon generation script for CCI Discipleship Study App.
Extracts the approved tree-and-reader mark into two variants:
1. Full-color master variant (for PWA, iOS, and Android legacy launcher)
2. Android adaptive-icon foreground variant (transparent cutout centered within the 66dp safe zone)
Generates all required platform dimensions and formats deterministically.
"""

import os
import sys
import base64
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Candidate master image paths
MASTER_PATHS = [
    os.path.join(ROOT, 'mobile-assets', 'design-1-fabulous-inspired-restyle.png'),
    '/home/gamp/Downloads/design-1-fabulous-inspired-restyle.png',
    '/home/ubuntu/upload/design-1-fabulous-inspired-restyle.png'
]

def find_master():
    for p in MASTER_PATHS:
        if os.path.isfile(p):
            return p
    raise FileNotFoundError(f"Master image not found in: {MASTER_PATHS}")

def extract_adaptive_foreground(master_im):
    """
    Extracts the tree-and-reader mark as a clean transparent RGBA foreground:
    - Removes scenic background (dark square, sun, sky, hills)
    - Preserves tree canopy, branches, trunk, reader body/dress/hair, and orange/red book
    - Retains negative spaces (leaf cutouts, branch spaces, face silhouette, leg space)
    - Smooth anti-aliased alpha without matte or fringe
    """
    w, h = master_im.size
    pix = master_im.load()

    fg_mask = Image.new('L', (w, h), 0)
    fg_pix = fg_mask.load()

    # 1. White elements: reader hair, dress, legs, tree trunk, branches
    for y in range(300, 1625):
        for x in range(800, 1560):
            r, g, b, *_ = pix[x, y]
            if r > 205 and g > 205 and b > 205:
                fg_pix[x, y] = 255

    # 2. Book: orange page, red page, spine
    for y in range(1030, 1175):
        for x in range(825, 1015):
            r, g, b, *_ = pix[x, y]
            if r > 210 and g > 210 and b > 210:
                continue
            is_orange_page = (r > 240 and g >= 85 and b <= 95)
            is_red_page = (r > 210 and g <= 55 and 65 <= b <= 105)
            is_spine = (r > 230 and 55 < g < 85 and 65 <= b <= 105)
            if is_orange_page or is_red_page or is_spine:
                fg_pix[x, y] = 255

    # 3. Canopy lobes: purple/violet/blue
    for y in range(235, 995):
        for x in range(418, 1745):
            r, g, b, *_ = pix[x, y]
            if r > 205 and g > 205 and b > 205:
                continue
            if b >= 195 and 35 <= g <= 125:
                if x < 600 and r > 195 and b < 230:
                    continue
                fg_pix[x, y] = 255

    cutout = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    cutout_pix = cutout.load()

    # 1-pixel dilation to find soft anti-aliased edge transitions
    dilated = fg_mask.filter(ImageFilter.MaxFilter(3))
    dil_pix = dilated.load()

    for y in range(h):
        for x in range(w):
            if fg_pix[x, y] == 255:
                cutout_pix[x, y] = (pix[x, y][0], pix[x, y][1], pix[x, y][2], 255)
            elif dil_pix[x, y] == 255:
                r, g, b, *_ = pix[x, y]
                # White edge transition
                if 300 <= y <= 1625 and 800 <= x <= 1560 and (r > 100 and g > 100):
                    alpha = int(max(0, min(255, (r - 23) / (254 - 23) * 255)))
                    if alpha > 25:
                        cutout_pix[x, y] = (254, 254, 254, alpha)
                # Canopy edge transition
                elif 235 <= y <= 995 and 418 <= x <= 1745 and b > 140:
                    alpha = int(max(0, min(255, (b - 120) / (230 - 120) * 255)))
                    if alpha > 25:
                        cutout_pix[x, y] = (r, g, b, alpha)

    return cutout

def create_adaptive_foreground_canvas(cutout, canvas_size):
    """
    Scales and centers the transparent artwork within the 66dp Android adaptive safe zone.
    On a 108dp canvas, safe zone diameter is 66dp (61.11%).
    """
    bbox = cutout.getbbox()
    cropped = cutout.crop(bbox)
    cw, ch = cropped.size

    # Target height is ~58% of canvas size to stay comfortably within the 61.1% safe zone
    target_h = int(round(canvas_size * 0.578))
    scale = target_h / ch
    target_w = int(round(cw * scale))

    scaled = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)

    canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    offset_x = (canvas_size - target_w) // 2
    offset_y = (canvas_size - target_h) // 2
    canvas.paste(scaled, (offset_x, offset_y), scaled)
    return canvas

def main():
    master_file = find_master()
    print(f"Loading master artwork: {master_file}")
    master_im = Image.open(master_file).convert('RGBA')

    # Copy master into mobile-assets for long-term project reproducibility
    stored_master = os.path.join(ROOT, 'mobile-assets', 'design-1-fabulous-inspired-restyle.png')
    if master_file != stored_master:
        master_im.save(stored_master)
        print(f"Saved master artwork copy to: {stored_master}")

    # Extract adaptive foreground cutout
    print("Extracting transparent tree-and-reader foreground...")
    cutout = extract_adaptive_foreground(master_im)

    # 1. Mobile assets masters
    app_icon_1024 = master_im.resize((1024, 1024), Image.Resampling.LANCZOS)
    app_icon_1024.save(os.path.join(ROOT, 'mobile-assets', 'cci-app-icon-1024.png'))
    print("Saved mobile-assets/cci-app-icon-1024.png")

    fg_512 = create_adaptive_foreground_canvas(cutout, 512)
    fg_512.save(os.path.join(ROOT, 'mobile-assets', 'cci-android-foreground-512.png'))
    print("Saved mobile-assets/cci-android-foreground-512.png")

    # 2. iOS launcher icon (1024x1024 RGB)
    ios_icon = app_icon_1024.convert('RGB')
    ios_icon_path = os.path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png')
    ios_icon.save(ios_icon_path)
    print(f"Saved {ios_icon_path}")

    # 3. Android launcher resources
    android_res = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
    densities = {
        'mdpi': (48, 108),
        'hdpi': (72, 162),
        'xhdpi': (96, 216),
        'xxhdpi': (144, 324),
        'xxxhdpi': (192, 432)
    }

    for density, (legacy_size, fg_size) in densities.items():
        density_dir = os.path.join(android_res, f"mipmap-{density}")
        os.makedirs(density_dir, exist_ok=True)

        # Foreground
        fg_im = create_adaptive_foreground_canvas(cutout, fg_size)
        fg_im.save(os.path.join(density_dir, 'ic_launcher_foreground.png'))

        # Legacy square launcher icon
        legacy_im = master_im.resize((legacy_size, legacy_size), Image.Resampling.LANCZOS)
        legacy_im.save(os.path.join(density_dir, 'ic_launcher.png'))

        # Legacy round launcher icon
        round_mask = Image.new('L', (legacy_size, legacy_size), 0)
        from PIL import ImageDraw
        draw = ImageDraw.Draw(round_mask)
        draw.ellipse((0, 0, legacy_size, legacy_size), fill=255)
        round_im = Image.new('RGBA', (legacy_size, legacy_size), (0, 0, 0, 0))
        round_im.paste(legacy_im, (0, 0), round_mask)
        round_im.save(os.path.join(density_dir, 'ic_launcher_round.png'))

        print(f"Saved Android {density}: foreground ({fg_size}px), launcher & round ({legacy_size}px)")

    # 4. Web and PWA icons
    icons_dir = os.path.join(ROOT, 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    icon_512 = master_im.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512.save(os.path.join(icons_dir, 'icon-512.png'))
    print("Saved icons/icon-512.png")

    icon_192 = master_im.resize((192, 192), Image.Resampling.LANCZOS)
    icon_192.save(os.path.join(icons_dir, 'icon-192.png'))
    print("Saved icons/icon-192.png")

    apple_touch = master_im.resize((180, 180), Image.Resampling.LANCZOS)
    apple_touch.save(os.path.join(icons_dir, 'apple-touch-icon.png'))
    print("Saved icons/apple-touch-icon.png")

    # Favicon ICO with 16, 32, 48
    icon_48 = master_im.resize((48, 48), Image.Resampling.LANCZOS)
    icon_32 = master_im.resize((32, 32), Image.Resampling.LANCZOS)
    icon_16 = master_im.resize((16, 16), Image.Resampling.LANCZOS)
    icon_48.save(
        os.path.join(ROOT, 'favicon.ico'),
        format='ICO',
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[icon_32, icon_16]
    )
    icon_48.save(
        os.path.join(icons_dir, 'favicon.ico'),
        format='ICO',
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[icon_32, icon_16]
    )
    print("Saved favicon.ico")

    # SVG icon embedding full-resolution 512px restyle
    with open(os.path.join(icons_dir, 'icon-512.png'), 'rb') as f:
        png_b64 = base64.b64encode(f.read()).decode('ascii')

    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="CCI Discipleship Study">
  <image width="512" height="512" href="data:image/png;base64,{png_b64}"/>
</svg>
'''
    with open(os.path.join(icons_dir, 'icon.svg'), 'w', encoding='utf-8') as f:
        f.write(svg_content)
    # 5. Splash screens for iOS and Android
    generate_splash_screens(master_im)

    print("Icon and splash generation completed successfully.")

def generate_splash_screens(master_im):
    """
    Generates matching splash screens for iOS and Android:
    - Master: mobile-assets/cci-splash-2732.png (2732x2732 RGB)
    - iOS: ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png (1x, 2x, 3x)
    - Android: android/app/src/main/res/drawable-*/splash.png (portrait, landscape, and fallback)
    - Background: deep midnight indigo #111146 (RGB: 17, 17, 70) matching the app-icon backdrop.
    - Artwork centered proportionally (inner squircle ~47.5% of min dimension).
    """
    bg_color = (17, 17, 70)
    
    # 1. Master 2732x2732 splash
    splash_2732 = Image.new('RGB', (2732, 2732), bg_color)
    art_2732_size = int(round(2732 * 0.475 * (1920 / 1634)))
    scaled_2732 = master_im.resize((art_2732_size, art_2732_size), Image.Resampling.LANCZOS)
    offset_2732 = (2732 - art_2732_size) // 2
    splash_2732.paste(scaled_2732, (offset_2732, offset_2732))
    
    master_splash_path = os.path.join(ROOT, 'mobile-assets', 'cci-splash-2732.png')
    splash_2732.save(master_splash_path)
    print("Saved mobile-assets/cci-splash-2732.png")
    
    # 2. iOS Splash assets (Splash.imageset)
    ios_splash_dir = os.path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset')
    for fname in ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']:
        splash_2732.save(os.path.join(ios_splash_dir, fname))
        print(f"Saved iOS splash: {fname}")
        
    # 3. Android Splash assets
    android_res = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
    
    # Android portrait densities
    port_densities = {
        'mdpi': (320, 480),
        'hdpi': (480, 800),
        'xhdpi': (720, 1280),
        'xxhdpi': (960, 1600),
        'xxxhdpi': (1280, 1920)
    }
    for density, (w, h) in port_densities.items():
        dir_name = os.path.join(android_res, f"drawable-port-{density}")
        os.makedirs(dir_name, exist_ok=True)
        art_size = int(round(w * 0.475 * (1920 / 1634)))
        scaled = master_im.resize((art_size, art_size), Image.Resampling.LANCZOS)
        splash_im = Image.new('RGB', (w, h), bg_color)
        splash_im.paste(scaled, ((w - art_size) // 2, (h - art_size) // 2))
        splash_im.save(os.path.join(dir_name, 'splash.png'))
        print(f"Saved Android portrait splash: drawable-port-{density}/splash.png ({w}x{h})")

    # Android landscape densities
    land_densities = {
        'mdpi': (480, 320),
        'hdpi': (800, 480),
        'xhdpi': (1280, 720),
        'xxhdpi': (1600, 960),
        'xxxhdpi': (1920, 1280)
    }
    for density, (w, h) in land_densities.items():
        dir_name = os.path.join(android_res, f"drawable-land-{density}")
        os.makedirs(dir_name, exist_ok=True)
        art_size = int(round(h * 0.475 * (1920 / 1634)))
        scaled = master_im.resize((art_size, art_size), Image.Resampling.LANCZOS)
        splash_im = Image.new('RGB', (w, h), bg_color)
        splash_im.paste(scaled, ((w - art_size) // 2, (h - art_size) // 2))
        splash_im.save(os.path.join(dir_name, 'splash.png'))
        print(f"Saved Android landscape splash: drawable-land-{density}/splash.png ({w}x{h})")

    # Android default fallback drawable/splash.png (480x320)
    fallback_dir = os.path.join(android_res, 'drawable')
    os.makedirs(fallback_dir, exist_ok=True)
    art_size = int(round(320 * 0.475 * (1920 / 1634)))
    scaled = master_im.resize((art_size, art_size), Image.Resampling.LANCZOS)
    splash_fallback = Image.new('RGB', (480, 320), bg_color)
    splash_fallback.paste(scaled, ((480 - art_size) // 2, (320 - art_size) // 2))
    splash_fallback.save(os.path.join(fallback_dir, 'splash.png'))
    print("Saved Android fallback splash: drawable/splash.png (480x320)")

if __name__ == '__main__':
    main()
