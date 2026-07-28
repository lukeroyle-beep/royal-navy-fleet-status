import { spawn } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);

export function validatePrivatePreviewHost(value) {
  if (!value) {
    throw new Error(
      "A private preview hostname is required. Usage: npm run preview:private -- <device>.<tailnet>.ts.net",
    );
  }

  const host = value.trim().toLowerCase();
  const validHostname =
    host.length <= 253 &&
    host.endsWith(".ts.net") &&
    host.split(".").every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    );

  if (!validHostname) {
    throw new Error(
      "Private preview hostname must end in .ts.net and must not include a protocol, port, path or spaces.",
    );
  }

  return host;
}

export function privatePreviewOptions(host) {
  return {
    env: {
      ...process.env,
      PRIVATE_PREVIEW_HOST: host,
    },
    viteArguments: ["preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
  };
}

async function main() {
  try {
    const host = validatePrivatePreviewHost(process.argv[2]);
    const distIndex = new URL("../dist/index.html", import.meta.url);
    if (!fs.existsSync(distIndex)) {
      throw new Error("Production build not found. Run npm run build before starting private preview.");
    }

    const viteEntry = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
    const options = privatePreviewOptions(host);
    const child = spawn(process.execPath, [viteEntry, ...options.viteArguments], {
      env: options.env,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      console.error(`Private preview could not start: ${error.message}`);
      process.exitCode = 1;
    });
    child.on("exit", (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      process.exitCode = code ?? 1;
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] === scriptPath) {
  main();
}
