# Local Development Environment

## 1. Setting Up WSL (Windows Users Only)

WSL 2 is the recommended standard. It provides a full Linux kernel, which is essential for Docker and high-performance file system operations.

- **Primary Guide:** [Install Linux on Windows with WSL](https://learn.microsoft.com/en-us/windows/wsl/install)
- **Manual Steps:** [Manual installation for older versions](https://learn.microsoft.com/en-us/windows/wsl/install-manual)

> **Pro-Tip:** After installation, ensure you are using **WSL 2** by running `wsl -l -v` in PowerShell. If it says version 1, update it using `wsl --set-version <distro> 2`.

---

## 2. GitHub & Security Configuration

### SSH Authentication

Using SSH keys is more secure and removes the need to enter credentials for every "push" or "pull."

- **Guide:** [Generating a New SSH Key](https://docs.github.com/en/github/authenticating-to-github/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent)

### GPG Commit Signing

Signing commits proves that the code actually came from you.

**Setup Steps:**

1. **Generate Key:** Follow the [GitHub GPG Guide](https://docs.github.com/en/github/authenticating-to-github/managing-commit-signature-verification/signing-commits).
2. **Configure Git:**

```sh
# Replace <KEY_ID> with your 16-character GPG key ID
git config --global user.signingkey <KEY_ID>
git config --global commit.gpgsign true
git config --global tag.gpgsign true

```

3. **WSL Fix:** If you are on WSL, add this to your `~/.bashrc` or `~/.zshrc` to ensure the GPG prompt appears correctly:

```sh
export GPG_TTY=$(tty)

```

## 3. Cloning the Repository

```sh
# Clone via SSH
git clone git@github.com:bcgov/common-hosted-workflow.git
cd common-hosted-workflow

```

## 4. Development Tooling (`asdf`)

We use `asdf` to ensure every developer uses the exact same versions of Python, Node, or Docker-compose defined in `.tool-versions`.

### Installation

Install `asdf` according to the `asdf` installation guide.

- https://asdf-vm.com/guide/getting-started.html#getting-started

```sh
# Download the ASDF binary
curl -fsSL -o asdf.tar.gz "https://github.com/asdf-vm/asdf/releases/download/v0.18.0/asdf-v0.18.0-linux-amd64.tar.gz" || { echo "❌ Failed to download ASDF"; exit 1; }

# Extract and clean up
tar -xzf asdf.tar.gz
rm -f asdf.tar.gz

# Move to local binaries
mv asdf /usr/local/bin/

# Add shims to PATH (Update ~/.bashrc, ~/.zshrc, or ~/.bash_profile accordingly)
echo 'export PATH="/usr/local/bin/:${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"' >> ~/.bashrc
```

### Install Project Dependencies

Run these commands inside the repository root:

````sh
# 1. Add plugins based on .tool-versions
cut -d' ' -f1 .tool-versions | xargs -I % asdf plugin add %

# 2. Special case for docker-compose plugin if not in .tool-versions
asdf plugin-add docker-compose https://github.com/virtualstaticvoid/asdf-docker-compose.git || true

# 3. Install the specific versions
asdf install

# 4. Verify
asdf current

---

## 5. Python & Pre-commit Hooks

To maintain code quality, we use `pre-commit` to run linters automatically before you record a commit.

```sh
# Upgrade pip and install requirements
pip install --upgrade pip
pip install -r requirements.txt

# Setup git hooks
pre-commit install

````

> **Note:** If `pre-commit` fails during a commit, read the output carefully. It will often "fix" the files for you, requiring you to `git add` the changes before trying the commit again.
