#!/usr/bin/env bash
# One-time server preparation (Ubuntu 22.04/24.04 on Oracle Cloud, ARM or x86). Run ON THE VM:
#   bash setup-vm.sh
set -euo pipefail
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl rsync unattended-upgrades
# Docker Engine + compose plugin
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi
# Oracle's Ubuntu images block everything but SSH in iptables: open HTTP/HTTPS (Caddy needs 80 for certificates).
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport $port -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport $port -j ACCEPT
done
sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
# Automatic security updates
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
# 2 GB swap as a safety net for builds
if [ ! -f /swapfile ]; then sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab; fi
mkdir -p ~/accountability
echo "Done. Log out and back in (for the docker group), then run deploy/push.sh from your Mac."
