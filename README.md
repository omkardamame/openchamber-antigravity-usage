# Antigravity Usage for OpenChamber

Displays the four Antigravity quota windows (`5-Hour`, `Weekly`, `Claude/GPT | 5-Hour`, `Claude/GPT | Weekly`) in OpenChamber's native **Usage** and **Work Status** panels using `agy -p /usage --output-format json`.

- **No ACP plugin required:** Works independently of `opencode-antigravity-acp` or any OpenCode provider plugin. It only reads quota from the official `agy` CLI.
- **Two-decimal precision:** Reads exact `remaining_fraction` values from `agy` JSON output and formats `valueLabel` to two decimal places while preserving numeric `usedPercent` for OpenChamber's built-in warning/error color thresholds.
- **Safe defaults:** Never reads or stores Google OAuth token files; runs `agy` with a minimal allowlisted environment and handles invalid `1970` epoch reset dates as unknown (`null`).

> **Note:** Google states that wrapping `agy` in third-party applications is unsupported under consumer plans. Use at your own discretion.

## Requirements

- **OpenChamber** `>= 2.7.0`
- **Antigravity CLI (`agy`)** installed (in `~/.local/bin/agy`, `/opt/homebrew/bin/agy`, `/usr/local/bin/agy`, or on `PATH`) and signed in (`agy -p /usage` works in your terminal)

## Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/omkardamame/openchamber-antigravity-usage.git
   ```
2. In OpenChamber, open **Settings → Extensions** and add the cloned folder path.
3. Approve the local service permission (`exec: ["agy"]`).
4. Enable the **Antigravity** extension provider under **Settings → Usage** / **Work Status**.

## Development

Pre-built `service/main.js` is included so end users do not need Node.js or Bun installed separately.

```bash
npm install
npm test
npm run build
```

## License

[MIT](LICENSE) © Omkar Damame
