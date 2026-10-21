#!/bin/zsh
# Builds the app, installs it on a TV in Developer Mode and launches it,
# optionally on a video: tools/tv/deploy.sh [videoId]
#
# Needs an SSH host for the TV (default `lgtv`, see README) and an ares device
# pointing at 127.0.0.1:2222 (default `lgtv-tunnel`). Both are reached through
# SSH tunnels, which also keeps macOS from blocking local network access for
# node-based tools.
set -e

TV_SSH_HOST=${TV_SSH_HOST:-lgtv}
ARES_DEVICE=${ARES_DEVICE:-lgtv-tunnel}

cd "$(dirname "$0")/../.."
APP_ID=$(node -p "require('./assets/appinfo.json').id")

# (Re)open a tunnel; an old one can be left dead after the TV restarts.
tunnel() {
  pkill -f "127.0.0.1:$1:127.0.0.1:$2" || true
  ssh -f -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
    -L "127.0.0.1:$1:127.0.0.1:$2" "$TV_SSH_HOST"
}

pnpm run -s lint:tsc
pnpm run -s lint:eslint
pnpm run -s test:unit >/dev/null 2>&1 || pnpm run -s test:unit
pnpm run -s build >/dev/null
# Personal overrides (gitignored), e.g. icons that must not be published.
if [[ -d assets-local ]]; then cp assets-local/*.png dist/; fi
pnpm run -s test:compat >/dev/null
rm -f "${APP_ID}"_*.ipk
pnpm run -s package >/dev/null
IPK=$(ls "${APP_ID}"_*.ipk)

# Install through the dev-mode install service, like ares-install does.
scp -q "$IPK" "$TV_SSH_HOST:/media/developer/temp/deploy.ipk"
ssh "$TV_SSH_HOST" "rm -f /tmp/deploy.log
  (luna-send-pub -i luna://com.webos.appInstallService/dev/install \
    '{\"id\":\"$APP_ID\",\"ipkUrl\":\"/media/developer/temp/deploy.ipk\",\"subscribe\":true}' \
    > /tmp/deploy.log 2>&1 &)
  sleep 15
  grep -oE '\"state\":\"[^\"]+\"|errorText\":\"[^\"]+\"' /tmp/deploy.log | tail -1
  rm -f /media/developer/temp/deploy.ipk" 2>/dev/null

tunnel 2222 9922  # ares
tunnel 19998 9998 # web inspector, used by tools/tv/cdp.cjs

if [[ -n $1 ]]; then
  [[ $1 =~ '^[A-Za-z0-9_-]{11}$' ]] || { echo "Not a YouTube video ID: $1" >&2; exit 2; }
  ares-launch --device "$ARES_DEVICE" "$APP_ID" -p "{\"contentTarget\":\"v=$1\"}" | tail -1
else
  ares-launch --device "$ARES_DEVICE" "$APP_ID" | tail -1
fi
