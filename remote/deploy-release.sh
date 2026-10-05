#!/bin/bash
# Upgrade a remote station to the server release packaged in the installed Mac app, with the gates of the manual
# upgrade in docs/remote/OPERATIONS.md: the archive matches its build record, the private vault is unlocked, no run
# or standing goal is in progress, station data and service files are backed up, the installer's health and
# unauthenticated-refusal gates pass, and the data afterwards matches the backup. Any failure after the station is
# stopped puts the previous release, its service files and its data back and starts it again. Superseded releases
# are removed only after a verified install. Nothing changes until every precondition holds; safe to re-run.
#
#   remote/deploy-release.sh SSH_HOST [APP_BUNDLE]
#
# Exit status: 0 installed or already current · 2 server unreachable · 3 private vault locked · 4 station busy
#              1 any other failure (after a rollback when the station had been stopped)
set -euo pipefail
host=${1:?usage: remote/deploy-release.sh SSH_HOST [APP_BUNDLE]}
app=${2:-/Applications/StarNet.app}
archive="$app/Contents/Resources/starnet-server.tar.gz"
record="$app/Contents/Resources/REMOTE-BUILD.json"
[[ -f "$archive" && -f "$record" ]] || { echo "No packaged server release in $app" >&2; exit 1; }
field() { node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(j[process.argv[2]]||""))' "$record" "$1"; }
rev=$(field revision); sha=$(field serverSHA256)
[[ "$rev" =~ ^[0-9a-f]{40}$ && "$sha" =~ ^[0-9a-f]{64}$ ]] || { echo "Unreadable build record in $record" >&2; exit 1; }
[[ "$(shasum -a 256 "$archive" | cut -d' ' -f1)" == "$sha" ]] || { echo "The packaged archive does not match its build record" >&2; exit 1; }
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
ssh "${ssh_opts[@]}" "$host" true >/dev/null 2>&1 || { echo "$host is unreachable" >&2; exit 2; }
upload="/var/tmp/starnet-server-${rev:0:12}.tar.gz"

# 1. Preconditions on the server (read-only). Prints OWNER/DATA/STATE lines; exit 0 ready, 10 already current.
pre=0
facts=$(ssh "${ssh_opts[@]}" "$host" sudo -n bash -s -- "$rev" <<'REMOTE'
set -euo pipefail
rev=$1
# read the unit first: grep -m1 inside a pipefail pipeline can SIGPIPE systemctl while it still writes a drop-in
unit=$(systemctl cat starnet-remote.service 2>/dev/null) || { echo 'ERROR no starnet-remote.service on this server'; exit 1; }
exec_line=$(grep -m1 '^ExecStart=' <<<"$unit") || { echo 'ERROR the starnet-remote.service unit has no ExecStart'; exit 1; }
owner=$(sed -n 's/.*--owner \([0-9][0-9]*\).*/\1/p' <<<"$exec_line")
data=$(sed -n 's/.*--data \([^ ]*\).*/\1/p' <<<"$exec_line")
[[ -n "$owner" && -n "$data" ]] || { echo 'ERROR could not read the owner and data directory from the service'; exit 1; }
echo "OWNER $owner"; echo "DATA $data"
if [[ "$data" == /srv/private/* ]] && ! mountpoint -q /srv/private; then echo 'STATE vault-locked'; exit 3; fi
[[ -d "$data/workspaces" ]] || { echo "ERROR $data/workspaces is missing"; exit 1; }
if [[ "$(readlink -f /opt/starnet/current)" == "/opt/starnet/releases/$rev" ]]; then echo 'STATE current'; exit 10; fi
# busy: a run journal written in the last 30 minutes, or a standing goal still active
recent=$(find "$data/workspaces/.run-journal" -type f -mmin -30 2>/dev/null | wc -l)
node=$(readlink -f /opt/starnet/current)/remote/runtimes/node-linux-x64
[[ -x "$node" ]] || node=$(command -v node || true)
goals=0
if [[ -d "$data/workspaces/.remote-goals" && -n "$node" ]]; then
  goals=$("$node" -e 'const fs=require("fs"),p=require("path"),d=process.argv[1];let n=0;for(const f of fs.readdirSync(d).filter(f=>f.endsWith(".json"))){try{const r=JSON.parse(fs.readFileSync(p.join(d,f),"utf8"));if(r&&r.goal&&r.goal.status==="active")n++}catch(_){n++}}process.stdout.write(String(n))' "$data/workspaces/.remote-goals")
fi
if [[ "$recent" != 0 || "$goals" != 0 ]]; then echo "STATE busy runs=$recent goals=$goals"; exit 4; fi
avail=$(df --output=avail -B1M / | tail -1 | tr -d ' ')
(( avail > 5000 )) || { echo "ERROR only ${avail} MB free on / (5000 MB needed)"; exit 1; }
echo 'STATE ready'
REMOTE
) || pre=$?
printf '%s\n' "$facts" | sed -n 's/^\(..*\)$/  server: \1/p'
case $pre in
  0) ;;
  10) echo "Already running $rev"; exit 0 ;;
  3) echo "The private vault is locked; unlock it, then run this again" >&2; exit 3 ;;
  4) echo "The station is busy; run this again when it is idle" >&2; exit 4 ;;
  *) echo "Precondition check failed" >&2; exit 1 ;;
esac
owner=$(sed -n 's/^OWNER //p' <<<"$facts"); data=$(sed -n 's/^DATA //p' <<<"$facts")

# 2. Upload and verify the archive (resumable).
rsync --partial --inplace -e "ssh ${ssh_opts[*]}" "$archive" "$host:$upload"
remote_sha=$(ssh "${ssh_opts[@]}" "$host" sha256sum "$upload" | cut -d' ' -f1)
[[ "$remote_sha" == "$sha" ]] || { echo "The uploaded archive does not match (got ${remote_sha:0:12})" >&2; exit 1; }

# 3. Install with backup, verification and automatic rollback. It runs on the server as a transient systemd unit,
#    so it completes (or rolls back) even if this SSH session drops; this side follows its journal.
unit="starnet-deploy-${rev:0:12}"
script="/var/tmp/$unit.sh"
ssh "${ssh_opts[@]}" "$host" "sudo -n tee $script >/dev/null && sudo -n chmod 0700 $script" <<'REMOTE'
set -euo pipefail
rev=$1; owner=$2; data=$3; upload=$4
work=$(mktemp -d /var/tmp/starnet-release.XXXXXX)
tar --warning=no-unknown-keyword -xzf "$upload" -C "$work"
[[ "$(cat "$work/RELEASE")" == "$rev" ]] || { echo "the archive holds $(cat "$work/RELEASE"), not $rev"; exit 1; }
previous=$(readlink -f /opt/starnet/current)
# a release folder left by an earlier attempt that never became current would make the installer refuse
if [[ -e "/opt/starnet/releases/$rev" && "$previous" != "/opt/starnet/releases/$rev" ]]; then rm -rf "/opt/starnet/releases/$rev"; fi
if [[ "$data" == /srv/private/* ]]; then root=/srv/private/starnet-upgrade-backups; else root=/var/backups/starnet-upgrade-backups; fi
backup="$root/$rev"; [[ -e "$backup" ]] && backup="$backup-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$root" "$backup"
systemctl stop starnet-remote.service
# until the installer runs, any failure only needs the untouched previous release started again
trap 'trap - ERR; echo "backup failed: starting the previous release again"; systemctl start starnet-remote.service; exit 1' ERR
cp -a "$data" "$backup/data"
cp -a /etc/systemd/system/starnet-remote.service "$backup/starnet-remote.service"
if [[ -e /usr/local/bin/starnet ]]; then cp -a /usr/local/bin/starnet "$backup/starnet-cli"; fi
echo "backup $backup ($(find "$backup/data" -type f | wc -l) files)"
rollback() {
  trap - ERR
  echo 'install failed: restoring the previous release, its service files and its data'
  systemctl stop starnet-remote.service || true
  ln -sfn "$previous" /opt/starnet/current.new && mv -Tf /opt/starnet/current.new /opt/starnet/current
  cp -a "$backup/starnet-remote.service" /etc/systemd/system/starnet-remote.service
  if [[ -e "$backup/starnet-cli" ]]; then cp -a "$backup/starnet-cli" /usr/local/bin/starnet; fi
  mv "$data" "$backup/data-after-failed-install" && cp -a "$backup/data" "$data"
  systemctl daemon-reload
  systemctl start starnet-remote.service
  rm -rf "$work"
  echo "rolled back to $(basename "$previous")"
  rm -f "$0"
  exit 1
}
trap rollback ERR
bash "$work/remote/install-linux.sh" "$owner" "$data"
[[ "$(readlink -f /opt/starnet/current)" == "/opt/starnet/releases/$rev" ]]
systemctl is-active --quiet starnet-remote.service
trap - ERR
# station data must match the backup; the regenerated workspace-owner claim is expected to change
( cd "$backup/data" && find . -type f -print0 | sort -z | xargs -0 sha256sum ) > "$work/before"
( cd "$data" && find . -type f -print0 | sort -z | xargs -0 sha256sum ) > "$work/after"
changed=$(diff "$work/before" "$work/after" | grep '^<' | grep -v 'starnet-workspace-owner.json' | sed 's/^< [0-9a-f]*  //' || true)
echo "data: $(wc -l < "$work/before") files backed up; changed or missing besides the owner claim: ${changed:-none}"
for old in /opt/starnet/releases/*; do
  [[ "$old" == "/opt/starnet/releases/$rev" ]] && continue
  rm -rf "$old" && echo "removed release $(basename "$old")"
done
rm -rf "$work" "$upload"
echo "INSTALLED $rev"
rm -f "$0"
REMOTE
# one quoted command string: ssh joins its arguments with spaces, which split an unquoted format in two
since=$(ssh "${ssh_opts[@]}" "$host" "date '+%Y-%m-%d %H:%M:%S'")
ssh "${ssh_opts[@]}" "$host" sudo -n systemd-run --quiet --collect --unit="$unit" /bin/bash "$script" "$rev" "$owner" "$data" "$upload"
state=active
for _ in $(seq 1 240); do
  sleep 5
  state=$(ssh "${ssh_opts[@]}" "$host" systemctl show -p ActiveState --value "$unit.service" 2>/dev/null || echo unreachable)
  [[ "$state" == active || "$state" == activating || "$state" == unreachable ]] || break
done
log=$(ssh "${ssh_opts[@]}" "$host" sudo -n journalctl -u "$unit.service" --since "'$since'" -o cat --no-pager 2>/dev/null || true)
printf '%s\n' "$log" | sed -n 's/^\(..*\)$/  install: \1/p'
if grep -qx "INSTALLED $rev" <<<"$log"; then echo "Installed $rev on $host"; exit 0; fi
if [[ "$state" == active || "$state" == activating || "$state" == unreachable ]]; then
  echo "The install is still running on the server after 20 minutes; follow it with: journalctl -u $unit" >&2
else
  echo "The install did not complete; see the lines above" >&2
fi
exit 1
