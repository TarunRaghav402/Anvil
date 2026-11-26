# Windows Setup Guide (Windows 10 / 11)

This guide covers setting up **Anvil** locally on Windows 10 or Windows 11 using PowerShell.

## 1. Install Prerequisites

### Option A: Using `winget` (built into Windows 10/11)

Open PowerShell and run:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install EclipseAdoptium.Temurin.21.JDK
winget install Gitleaks.Gitleaks
```

### Option B: Using Chocolatey (Administrator PowerShell)

```powershell
choco install nodejs-lts git temurin21 gitleaks -y
```

Close and reopen PowerShell so updated `PATH` and `JAVA_HOME` environment variables take effect, then verify:

```powershell
node -v
git --version
java -version
gitleaks version
```

Ensure `java -version` prints **21** or newer (required by `firebase-tools` emulators).

If PowerShell blocks `npm` scripts with a script execution policy error, enable local signed/user scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 2. Clone, Configure & Install

```powershell
git clone https://github.com/YOUR_USERNAME/anvil.git
cd anvil
Copy-Item .env.example .env
Copy-Item .firebaserc.example .firebaserc
npm install
```

> **Note:** `npm install` automatically configures `git config core.hooksPath .githooks` so the Node-based pre-commit secret scanner runs on every commit.

## 3. Start Emulators & Application

```powershell
npm run dev
```

This launches:

- **Firebase Emulator Suite** (Auth `:9099`, Storage `:9199`, Data Connect `:9399`, PGlite `:5432`, Emulator UI `http://127.0.0.1:4000`)
- **Backend Server** (`http://127.0.0.1:4001`)
- **Frontend Vite Server** (`http://localhost:5173`)

Once the emulators report ready, open a second PowerShell terminal in the repository root and seed sample data:

```powershell
npm run seed
```

## 4. Troubleshooting on Windows

### Port `5432` already in use

If a local PostgreSQL Windows service is already listening on port `5432`, stop it via Services (`services.msc`) or elevated PowerShell:

```powershell
Stop-Service postgresql*
```

### Checking which process holds a port (e.g. `4001`)

```powershell
Get-NetTCPConnection -LocalPort 4001 | Select-Object LocalAddress, LocalPort, State, OwningProcess
```

### Line Endings (`CRLF` vs `LF`)

This repository includes `.gitattributes` to normalize line endings automatically across Windows, macOS, and Linux. Inside Anvil's Git Commit & Push feature, the backend also sets `core.autocrlf false` and `core.fileMode false`.
