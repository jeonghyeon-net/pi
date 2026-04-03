#!/bin/bash
set -e

command -v brew >/dev/null || {
  echo "brew 설치 중..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
}

command -v mise >/dev/null || {
  echo "mise 설치 중..."
  brew install mise
}

mise trust
mise install
npm install
