from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def make_periodic(array: np.ndarray, band: int) -> np.ndarray:
    result = array.astype(np.float32, copy=True)
    height, width = result.shape[:2]
    for offset in range(band):
        weight = 0.5 * (1.0 + np.cos(np.pi * offset / max(1, band - 1)))
        left = result[:, offset].copy()
        right = result[:, width - 1 - offset].copy()
        average = (left + right) * 0.5
        result[:, offset] = left * (1.0 - weight) + average * weight
        result[:, width - 1 - offset] = right * (1.0 - weight) + average * weight
    for offset in range(band):
        weight = 0.5 * (1.0 + np.cos(np.pi * offset / max(1, band - 1)))
        top = result[offset].copy()
        bottom = result[height - 1 - offset].copy()
        average = (top + bottom) * 0.5
        result[offset] = top * (1.0 - weight) + average * weight
        result[height - 1 - offset] = bottom * (1.0 - weight) + average * weight
    return result


def save_rgb(path: Path, array: np.ndarray) -> None:
    Image.fromarray(np.clip(array, 0, 255).astype(np.uint8), mode="RGB").save(path)


def save_gray(path: Path, array: np.ndarray) -> None:
    Image.fromarray(np.clip(array, 0, 255).astype(np.uint8), mode="L").save(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--size", type=int, default=1024)
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    source = Image.open(args.input).convert("RGB").resize((args.size, args.size), Image.Resampling.LANCZOS)
    source_array = np.asarray(source, dtype=np.float32)

    # Remove residual broad illumination while retaining the photographed microstructure.
    low_frequency = np.asarray(source.filter(ImageFilter.GaussianBlur(radius=54)), dtype=np.float32)
    target_level = 24.0
    albedo = source_array * (target_level / np.maximum(low_frequency, 5.0))
    albedo = np.clip(albedo, 7.0, 43.0)
    albedo = make_periodic(albedo, 112)

    luminance = albedo.mean(axis=2)
    low, high = np.percentile(luminance, (1.0, 99.0))
    height = np.clip((luminance - low) / max(1e-5, high - low), 0.0, 1.0)
    height = np.asarray(
        Image.fromarray((height * 255).astype(np.uint8), mode="L").filter(ImageFilter.GaussianBlur(radius=0.65)),
        dtype=np.float32,
    ) / 255.0
    height = make_periodic(height, 112)

    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 1.45
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 1.45
    nz = np.ones_like(height)
    length = np.sqrt(dx * dx + dy * dy + nz * nz)
    normal = np.stack((-dx / length, -dy / length, nz / length), axis=2)
    normal = (normal * 0.5 + 0.5) * 255.0

    roughness = 232.0 - (height - 0.5) * 16.0
    roughness = make_periodic(roughness, 112)
    ambient_occlusion = 242.0 - (1.0 - height) * 24.0
    ambient_occlusion = make_periodic(ambient_occlusion, 112)

    stem = "cabinet-tolex-real"
    save_rgb(args.output / f"{stem}_albedo.png", albedo)
    save_rgb(args.output / f"{stem}_normal.png", normal)
    save_gray(args.output / f"{stem}_roughness.png", roughness)
    save_gray(args.output / f"{stem}_ao.png", ambient_occlusion)
    save_gray(args.output / f"{stem}_height.png", height * 255.0)

    edge_x = float(np.abs(albedo[:, 0] - albedo[:, -1]).max())
    edge_y = float(np.abs(albedo[0] - albedo[-1]).max())
    print(
        {
            "mean_albedo": round(float(albedo.mean()), 3),
            "max_albedo": round(float(albedo.max()), 3),
            "edge_delta_x": round(edge_x, 3),
            "edge_delta_y": round(edge_y, 3),
        }
    )


if __name__ == "__main__":
    main()
