import json
import sys
import traceback

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor


def normalized(value):
    if hasattr(value, "pooler_output"):
        value = value.pooler_output
    elif not isinstance(value, torch.Tensor):
        value = value[0]
    return value / value.norm(dim=-1, keepdim=True)


def review_image(path, preprocessing):
    image = Image.open(path).convert("RGBA")
    matte = Image.new("RGBA", image.size, tuple(preprocessing["alphaCompositeRgb"]) + (255,))
    image = Image.alpha_composite(matte, image).convert("RGB")
    canvas_size = tuple(preprocessing["reviewCanvas"])
    resample = Image.Resampling.NEAREST if image.width <= canvas_size[0] and image.height <= canvas_size[1] else Image.Resampling.LANCZOS
    image.thumbnail(canvas_size, resample)
    canvas = Image.new("RGB", canvas_size, tuple(preprocessing["alphaCompositeRgb"]))
    canvas.paste(image, ((canvas.width - image.width) // 2, (canvas.height - image.height) // 2))
    return canvas


def main():
    model_dir = sys.argv[1]
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    model = CLIPModel.from_pretrained(model_dir, local_files_only=True, torch_dtype=dtype).to(device).eval()
    processor = CLIPProcessor.from_pretrained(model_dir, local_files_only=True)
    print(json.dumps({"ready": True, "device": device}), flush=True)
    for line in sys.stdin:
        request = json.loads(line)
        try:
            images = [review_image(value, request["preprocessing"]) for value in request["imagePaths"]]
            contrast_checks = request.get("compositionChecks", [])
            text_groups = [request["positiveTexts"], request["negativeTexts"], request["stylePositiveTexts"], request["styleNegativeTexts"]]
            for check in contrast_checks:
                text_groups.extend([check["positiveTexts"], check["negativeTexts"]])
            texts = [text for group in text_groups for text in group]
            image_inputs = processor(images=images, return_tensors="pt")
            text_inputs = processor(text=texts, return_tensors="pt", padding=True, truncation=True)
            image_inputs = {key: value.to(device) for key, value in image_inputs.items()}
            text_inputs = {key: value.to(device) for key, value in text_inputs.items()}
            with torch.inference_mode():
                image_features = normalized(model.get_image_features(**image_inputs))
                text_features = normalized(model.get_text_features(**text_inputs))
                similarities = (image_features @ text_features.T).float().cpu()
            offsets = []
            cursor = 0
            for group in text_groups:
                offsets.append((cursor, cursor + len(group)))
                cursor += len(group)
            results = []
            for row in similarities:
                values = []
                for start, end in offsets:
                    values.append(float(row[start:end].max().item()))
                contrast_results = []
                for index, check in enumerate(contrast_checks):
                    positive = values[4 + index * 2]
                    negative = values[5 + index * 2]
                    contrast_results.append({"id": check["id"], "positiveSimilarity": positive, "negativeSimilarity": negative, "margin": positive - negative})
                results.append({
                    "semanticSimilarity": values[0],
                    "negativeSimilarity": values[1],
                    "semanticMargin": values[0] - values[1],
                    "styleSimilarity": values[2],
                    "styleNegativeSimilarity": values[3],
                    "styleMargin": values[2] - values[3],
                    "compositionChecks": contrast_results,
                })
            print(json.dumps({"requestId": request["requestId"], "ok": True, "results": results}), flush=True)
        except Exception as error:
            print(json.dumps({"requestId": request.get("requestId"), "ok": False, "error": str(error), "trace": traceback.format_exc()}), flush=True)


if __name__ == "__main__":
    main()
