# macOS Setup Guide (Apple Silicon & Intel)

This guide covers setting up **Anvil** locally on macOS.

## 1. Install Prerequisites (Homebrew)

Install Node.js LTS, Git, OpenJDK 21, and `gitleaks`:

```bash
brew install node@22 git openjdk@21 gitleaks
```

Homebrew installs `openjdk@21` keg-only. Symlink it for macOS Java discovery and add both `node@22` and `openjdk@21` to your shell `PATH`:

**Apple Silicon (`/opt/homebrew`):**

```bash
sudo ln -sfn /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-21.jdk
echo 'export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"' >> ~/.zshrc
echo 'export JAVA_HOME="/opt/homebrew/opt/openjdk@21"' >> ~/.zshrc
source ~/.zshrc
```

_(On Intel Macs, replace `/opt/homebrew` with `/usr/local`.)_

Verify your toolchain:

```bash
node -v
git --version
java -version
gitleaks version
```

Ensure `java -version` prints **21** or higher.

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

In a second terminal tab, once the emulators are ready, seed sample accounts and the `Space Dodge` starter project:

```bash
npm run seed
```

Then open `http://localhost:5173`.

## 4. Troubleshooting on macOS

### Port Conflicts

- Backend defaults to port `4001` (explicitly avoiding port `5000`, which macOS AirPlay Receiver uses).
- If local PostgreSQL is running on `5432`, stop it before starting Data Connect Emulator:
  ```bash
  brew services stop postgresql@14
  ```
- Inspect what process holds a port:
  ```bash
  lsof -i :4001
  ```
