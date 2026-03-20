#!/usr/bin/env python3
"""
Train a YOLOv8 nano model for dice detection and pip classification.

Usage:
  1. Export your dataset ZIP from the no-cheat app's Training History → Frames tab
  2. Unzip it to create a dataset/ directory next to this script
  3. Run: python train-dice-model.py
  4. Copy the output ONNX model to the client:
     cp runs/detect/train/weights/best.onnx ../client/public/models/dice-yolov8n.onnx

Requirements:
  pip install ultralytics
"""

import shutil
from pathlib import Path

from ultralytics import YOLO


def main():
    script_dir = Path(__file__).parent
    dataset_dir = script_dir / "dataset"
    data_yaml = dataset_dir / "data.yaml"
    output_dir = script_dir / "runs"

    if not data_yaml.exists():
        print(f"Error: {data_yaml} not found.")
        print("Export your dataset ZIP from the no-cheat app and unzip it here.")
        print(f"Expected structure:")
        print(f"  {dataset_dir}/")
        print(f"    images/train/  *.png")
        print(f"    labels/train/  *.txt")
        print(f"    data.yaml")
        return

    # Count training images
    train_images = list((dataset_dir / "images" / "train").glob("*.png"))
    print(f"Found {len(train_images)} training images")

    if len(train_images) < 10:
        print("Warning: Very few training images. Consider capturing more data.")
        print("At least 50-100 images recommended for reasonable accuracy.")

    # Load YOLOv8 nano pretrained model
    model = YOLO("yolov8n.pt")

    # Train
    model.train(
        data=str(data_yaml),
        epochs=100,
        imgsz=640,
        batch=16,
        project=str(output_dir),
        name="detect",
        exist_ok=True,
        patience=20,  # early stopping
        save=True,
        plots=True,
    )

    # Export to ONNX
    best_pt = output_dir / "detect" / "weights" / "best.pt"
    if best_pt.exists():
        model = YOLO(str(best_pt))
        model.export(format="onnx", opset=12, simplify=True)

        best_onnx = best_pt.with_suffix(".onnx")
        target = script_dir.parent / "client" / "public" / "models" / "dice-yolov8n.onnx"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(best_onnx, target)
        print(f"\nModel exported to: {target}")
        print("The no-cheat app will automatically load this model on next page refresh.")
    else:
        print(f"Error: {best_pt} not found after training.")


if __name__ == "__main__":
    main()
