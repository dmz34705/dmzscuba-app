#!/bin/zsh -l
# Double-click in Finder to start Expo behind your ngrok tunnel in its own Terminal window.
cd "$(dirname "$0")" || exit 1
npm run tunnel
