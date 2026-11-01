#!/usr/bin/env bash
# Downloads the models into public/models (for running the app locally or bundling them yourself).
# GitHub Actions already does the first two steps for the APK build, so you only need this for local tests.
#   bash scripts/get-models.sh            -> background removal + text reading (about 15 MB)
#   bash scripts/get-models.sh --migan    -> also the object/text removal model (about 80 MB, bundles it into the app)
set -e
cd "$(dirname "$0")/.."
mkdir -p public/models && cd public/models
get() { [ -s "$1" ] && echo "have $1" || curl -fL --retry 3 -o "$1" "$2"; }
get u2netp.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx
echo "8e83ca70e441ab06c318d82300c84806  u2netp.onnx" | md5sum -c -
get ocr_det.onnx https://huggingface.co/monkt/paddleocr-onnx/resolve/main/detection/v3/det.onnx || echo "OCR detector failed"
get ocr_rec.onnx https://huggingface.co/monkt/paddleocr-onnx/resolve/main/languages/arabic/rec.onnx || echo "OCR reader failed"
get ocr_dict.txt https://huggingface.co/monkt/paddleocr-onnx/resolve/main/languages/arabic/dict.txt || echo "OCR dictionary failed"
if [ "$1" = "--migan" ]; then
  get migan_pipeline_v2.onnx https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx
fi
ls -l
