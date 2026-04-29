import sys
import os
from PIL import Image
import json
import argparse


def get_bbox(img: Image.Image):
    """返回非透明内容的 bbox (left, upper, right, lower)，全透明时返回 (0,0,w,h)"""
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    bbox = img.getbbox()
    if bbox is None:
        w, h = img.size
        return (0, 0, w, h)
    return bbox


def do_scan(root_path: str):
    """递归扫描（保持原有 scan 子命令功能不变）"""
    if not os.path.isdir(root_path):
        print(f"错误: 目录 '{root_path}' 不存在")
        sys.exit(1)

    max_w = max_h = 0
    total_png = 0
    folder_stats = {}

    for dirpath, _, filenames in os.walk(root_path):
        png_files = [f for f in filenames if f.lower().endswith('.png')]
        if not png_files:
            continue

        local_max_w = local_max_h = 0
        for f in png_files:
            try:
                with Image.open(os.path.join(dirpath, f)) as img:
                    w, h = img.size
                    max_w = max(max_w, w)
                    max_h = max(max_h, h)
                    local_max_w = max(local_max_w, w)
                    local_max_h = max(local_max_h, h)
                    total_png += 1
            except:
                continue

        rel_path = os.path.relpath(dirpath, root_path)
        if rel_path == '.':
            rel_path = '(root)'
        folder_stats[rel_path] = (len(png_files), local_max_w, local_max_h)

    print(f"\n=== 全局扫描结果 ===")
    print(f"共找到 {total_png} 个 PNG 文件")
    print(f"全局最大宽度: {max_w}px")
    print(f"全局最大高度: {max_h}px")
    print(f"\n建议全局画布尺寸（推荐直接复制使用）：")
    print(f"   --global-canvas {max_w + 40} {max_h + 60}")
    print(f"\n各子目录统计：")
    for folder in sorted(folder_stats.keys()):
        count, lw, lh = folder_stats[folder]
        print(f"  {folder:35} → {count:2d} 帧   最大 {lw:4d}×{lh:4d}")
    print()


def main():
    # ==================== scan 子命令（保留） ====================
    if len(sys.argv) > 1 and sys.argv[1] == 'scan':
        path = sys.argv[2] if len(sys.argv) > 2 else 'assets'
        do_scan(path)
        return

    # ==================== 最终单一主流程 ====================
    parser = argparse.ArgumentParser(description="PNG Spritesheet 最终形态 - 角色尺寸归一化 + 全局画布底锚对齐")
    parser.add_argument('dir_path', help='PNG 文件所在目录，例如 assets/idle/awake')
    parser.add_argument('--global-canvas', type=int, nargs=2, required=True, metavar=('W', 'H'),
                        help='全局画布尺寸（必须）')
    parser.add_argument('--size-mode', choices=['height', 'width'], required=True,
                        help='角色尺寸归一化模式（height=站立姿势按高度，width=躺姿按宽度）')
    parser.add_argument('--target-height', type=int, default=500,
                        help='height 模式的目标角色高度（默认 500）')
    parser.add_argument('--target-width', type=int, default=600,
                        help='width 模式的目标角色宽度（默认 600）')
    parser.add_argument('--bottom-margin', type=int, default=20,
                        help='底部留白像素数（默认 20）')

    args = parser.parse_args()

    dir_path = args.dir_path.rstrip('/\\')
    if not os.path.isdir(dir_path):
        print(f"错误: 目录 '{dir_path}' 不存在")
        sys.exit(1)

    png_files = [f for f in os.listdir(dir_path) if f.lower().endswith('.png')]
    png_files.sort()

    if not png_files:
        print("错误: 目录中没有找到 PNG 文件")
        sys.exit(1)

    print(f"正在处理 {os.path.basename(dir_path)} 目录（{len(png_files)} 帧）...")

    # 1. 加载所有原始图像
    original_images = []
    frame_names = []
    for filename in png_files:
        filepath = os.path.join(dir_path, filename)
        try:
            img = Image.open(filepath).convert('RGBA')
            original_images.append(img)
            frame_names.append(os.path.splitext(filename)[0])
        except Exception as e:
            print(f"错误: 无法打开 {filename}: {e}")
            sys.exit(1)

    # 2. 对每帧计算 alpha bbox
    bboxes = [get_bbox(img) for img in original_images]

    # 3. 按 size-mode 计算状态级缩放系数
    if args.size_mode == 'height':
        state_ref = max((b[3] - b[1]) for b in bboxes)
        target = args.target_height
        print(f"size-mode = height | 状态参考高度 (max bbox_h): {state_ref}px | 目标高度: {target}px")
    else:  # width
        state_ref = max((b[2] - b[0]) for b in bboxes)
        target = args.target_width
        print(f"size-mode = width | 状态参考宽度 (max bbox_w): {state_ref}px | 目标宽度: {target}px")

    scale = target / state_ref if state_ref > 0 else 1.0
    print(f"缩放系数: {scale:.4f}\n")

    # 4. 对每帧执行 NEAREST 等比缩放
    scaled_images = []
    scaled_sizes = []
    for i, img in enumerate(original_images):
        ow, oh = img.size
        new_w = max(1, int(ow * scale))
        new_h = max(1, int(oh * scale))
        scaled_img = img.resize((new_w, new_h), Image.NEAREST)
        scaled_images.append(scaled_img)
        scaled_sizes.append((new_w, new_h))

    # 5. 对缩放后的帧再次计算 bbox（位置可能因取整发生微小变化）
    scaled_bboxes = [get_bbox(img) for img in scaled_images]

    # 6. 按 bottom-center 锚点贴到全局画布
    global_w, global_h = args.global_canvas
    print(f"全局画布: {global_w}×{global_h} | bottom-margin: {args.bottom_margin}px")
    print(f"{'='*80}")
    print(f"{'帧名':<25} 原尺寸 → 缩放后 → 贴图偏移 (x,y)")
    print(f"{'-'*80}")

    final_images = []
    for i, (scaled_img, bbox) in enumerate(zip(scaled_images, scaled_bboxes)):
        left, upper, right, lower = bbox
        x_anchor = (left + right) // 2
        y_anchor = lower - 1                     # 最底部非透明像素

        target_x = global_w // 2
        target_y = global_h - args.bottom_margin

        offset_x = target_x - x_anchor
        offset_y = target_y - y_anchor

        # 创建全局透明画布并贴入
        canvas = Image.new('RGBA', (global_w, global_h), (0, 0, 0, 0))
        canvas.paste(scaled_img, (offset_x, offset_y), mask=scaled_img)
        final_images.append(canvas)

        # 每帧详细打印
        orig_w, orig_h = original_images[i].size
        scaled_w, scaled_h = scaled_img.size
        print(f"{frame_names[i]:<25} {orig_w:3d}×{orig_h:<3d} → "
              f"{scaled_w:3d}×{scaled_h:<3d} → ({offset_x:4d}, {offset_y:4d})")

    print(f"{'='*80}\n")

    # 7. 验证所有最终帧尺寸一致
    final_sizes = [img.size for img in final_images]
    if len(set(final_sizes)) > 1:
        print("错误: 最终帧尺寸不一致！")
        sys.exit(1)

    # 8. 横向拼接 spritesheet
    frame_count = len(final_images)
    frame_width, frame_height = global_w, global_h
    total_width = frame_width * frame_count

    spritesheet = Image.new('RGBA', (total_width, frame_height))
    for i, img in enumerate(final_images):
        spritesheet.paste(img, (i * frame_width, 0))

    # 9. 输出文件（覆盖同名旧文件）
    parent_dir = os.path.dirname(dir_path) or os.getcwd()
    dir_name = os.path.basename(dir_path)
    output_png = os.path.join(parent_dir, f"{dir_name}.png")
    output_json = os.path.join(parent_dir, f"{dir_name}.json")

    spritesheet.save(output_png, optimize=True)
    print(f"✓ Spritesheet 已保存: {output_png}")

    frames_dict = {name: idx for idx, name in enumerate(frame_names)}
    json_data = {
        "image": f"{dir_name}.png",
        "frameWidth": frame_width,
        "frameHeight": frame_height,
        "frameCount": frame_count,
        "frames": frames_dict
    }

    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, indent=2, ensure_ascii=False)

    print(f"✓ JSON 已保存: {output_json}")
    print(f"\n🎉 最终形态合成完成！")
    print(f"   帧数: {frame_count} 帧")
    print(f"   每帧尺寸: {frame_width} × {frame_height}")
    print(f"   Spritesheet 尺寸: {total_width} × {frame_height}")
    print(f"   输出目录: {parent_dir}")


if __name__ == "__main__":
    main()