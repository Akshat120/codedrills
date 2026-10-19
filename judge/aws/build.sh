#!/bin/sh
# Builds the Lambda zips into judge/dist/ (needs Docker):
#   compiler-layer.zip  → the "codedrills-gxx" layer
#   judge-function.zip  → the "codedrills-judge" function's code
set -eu
cd "$(dirname "$0")/.."
docker buildx build --platform linux/arm64 -f aws/Dockerfile.package --output type=local,dest=dist .
ls -lh dist/*.zip
