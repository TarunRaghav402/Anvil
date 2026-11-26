# Linux Setup Guide (Ubuntu / Debian / Fedora)

This guide covers setting up **Anvil** locally on Linux.

## 1. Install Prerequisites

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y curl git openjdk-21-jdk unzip
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

If another Java version was already installed, select JDK 21:

```bash
sudo update-alternatives --config java
```

### Fedora

```bash
sudo dnf install -y nodejs npm git java-21-openjdk-devel unzip
```

If needed, select JDK 21:

```bash
sudo alternatives --config java
```

### Install `gitleaks` (Recommended for Local Pre-Commit Checks)

Download the latest Linux binary from [gitleaks releases](https://github.com/gitleaks/gitleaks/releases) and place it in `/usr/local/bin/gitleaks`, or install via your distro package manager / Homebrew for Linux.

Verify versions:

```bash
node -v
git --version
java -version
```

## 2. Clone, Configure & Install

```bash
git clone https://github.com/YOUR_USERNAME/anvil.git
cd anvil
cp .env.example .env
cp .firebaserc.example .firebaserc
npm install
```

## 3. Start Emulators & Application

```bash
npm run dev
```

Once the emulators report ready, open a second terminal and seed sample users and the `Space Dodge` project:

```bash
npm run seed
```

Open `http://localhost:5173` in your browser.

## 4. Troubleshooting on Linux

### Port `5432` already in use by system PostgreSQL

Stop the local PostgreSQL daemon while running the Data Connect Emulator:

```bash
sudo systemctl stop postgresql
```

### Inspecting bound ports

```bash
ss -tulpn | grep 4001
```
