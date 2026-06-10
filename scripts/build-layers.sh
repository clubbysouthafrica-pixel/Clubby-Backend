#!/bin/bash
set -e

LAYER_BASE="layer-code"
LAYER_DIRS=("jwt_code" "jwks-rsa_code" "axios_code" "qrcode_code")

for layer in "${LAYER_DIRS[@]}"; do
  echo "Setting up layer: $layer"

  LAYER_PATH="$LAYER_BASE/$layer/nodejs"

  mkdir -p "$LAYER_PATH"

  if [ ! -f "$LAYER_PATH/package.json" ]; then
    echo "{
  \"name\": \"$layer\",
  \"version\": \"1.0.0\",
  \"description\": \"$layer Lambda Layer\",
  \"dependencies\": {}
}" > "$LAYER_PATH/package.json"
    echo "Created default package.json for $layer. Please add the required dependencies."
    continue
  fi

  echo "Installing dependencies in $LAYER_PATH..."
  rm -rf "$LAYER_PATH/node_modules"
  cd "$LAYER_PATH"
  npm install --omit=dev
  cd - > /dev/null
done

echo "✅ All layers set up."
