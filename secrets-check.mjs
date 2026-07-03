#!/usr/bin/env node
// secrets-check.mjs — Escaneo de secrets en el código (hook para IA)
//
// Detecta credenciales, tokens y secretos hardcodeados en el código fuente
// para prevenir que un agente filtre información sensible.
//
// Uso: node secrets-check.mjs [--staged] [--all]
//   --staged  Solo escanea archivos en staging (git diff --cached)
//   --all     Escanea todo el código fuente
//   (default) Escanea todo el código fuente

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { globSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RED = "\x1b[0;31m";
const YELLOW = "\x1b[0;33m";
const GREEN = "\x1b[0;32m";
const CYAN = "\x1b[0;36m";
const NC = "\x1b[0m";

const EXCLUDE_DIRS = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".pnp",
];

const EXCLUDE_FILES = [
  "*.lock",
  "*.lockb",
  "*.min.js",
  "*.min.css",
  "*.map",
  "*.svg",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.ico",
  "*.woff",
  "*.woff2",
  "*.ttf",
  "*.eot",
  "*.pdf",
];

const SECRET_RULES = [
  {
    name: "Supabase Service Role Key",
    pattern: /sb_secret_[a-zA-Z0-9\-_]{20,}/g,
    severity: "CRITICAL",
  },
  {
    name: "Supabase Publishable Key (safe, pero verificar contexto)",
    pattern: /sb_publishable_[a-zA-Z0-9\-_]{20,}/g,
    severity: "LOW",
    warnOnly: true,
  },
  {
    name: "AWS Access Key",
    pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    severity: "CRITICAL",
  },
  {
    name: "AWS Secret Key",
    pattern: /(?:aws[_\-]?secret|secret[_\-]?access[_\-]?key)\s*[:=]\s*["'][A-Za-z0-9\/+]{40}["']/gi,
    severity: "CRITICAL",
  },
  {
    name: "GCP API Key",
    pattern: /AIza[0-9A-Za-z\-_]{35}/g,
    severity: "CRITICAL",
  },
  {
    name: "Google OAuth Token",
    pattern: /ya29\.[0-9A-Za-z\-_]{50,}/g,
    severity: "CRITICAL",
  },
  {
    name: "OpenAI API Key",
    pattern: /sk-proj-[a-zA-Z0-9\-_]{40,}/g,
    severity: "CRITICAL",
  },
  {
    name: "OpenAI Legacy Key",
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    severity: "CRITICAL",
  },
  {
    name: "Anthropic API Key",
    pattern: /sk-ant-api[0-9]{2}-[a-zA-Z0-9\-_]{40,}/g,
    severity: "CRITICAL",
  },
  {
    name: "GitHub PAT (classic)",
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    severity: "CRITICAL",
  },
  {
    name: "GitHub PAT (fine-grained)",
    pattern: /github_pat_[a-zA-Z0-9_]{50,}/g,
    severity: "CRITICAL",
  },
  {
    name: "GitHub OAuth Token",
    pattern: /gho_[a-zA-Z0-9]{36}/g,
    severity: "CRITICAL",
  },
  {
    name: "GitLab PAT",
    pattern: /glpat-[a-zA-Z0-9\-_]{20,}/g,
    severity: "CRITICAL",
  },
  {
    name: "Private Key",
    pattern: /-----BEGIN (?:RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----/g,
    severity: "CRITICAL",
  },
  {
    name: "JWT Token",
    pattern: /eyJ[a-zA-Z0-9\-_]{10,}\.[a-zA-Z0-9\-_]{10,}\.[a-zA-Z0-9\-_]{10,}/g,
    severity: "HIGH",
  },
  {
    name: "Generic API Key Assignment",
    pattern: /(?:API[_-]?KEY|APIKEY|SECRET[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN)\s*[:=]\s*["'][a-zA-Z0-9\-_+.\/=]{20,}["']/gi,
    severity: "HIGH",
  },
  {
    name: "Password hardcodeado",
    pattern: /(?:PASSWORD|PASSWD|PWD|PASS)\s*[:=]\s*["'](?!\s*(?:your|replace|example|test|dummy|changeme|xxx|empty|none|null|password|1234))[^\s"']{4,}["']/gi,
    severity: "HIGH",
  },
  {
    name: "URL con credenciales embebidas",
    pattern: /https?:\/\/[^:\s]+:[^@\s]+@/g,
    severity: "HIGH",
  },
  {
    name: "Connection string con credenciales",
    pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@/g,
    severity: "CRITICAL",
  },
];

function collectFiles(rootDir) {
  const files = [];
  const dirStack = [rootDir];

  while (dirStack.length > 0) {
    const dir = dirStack.pop();
    try {
      const entries = globSync("*", {
        cwd: dir,
        withFileTypes: true,
        nodir: false,
      });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!EXCLUDE_DIRS.includes(entry.name) && !entry.name.startsWith(".")) {
            dirStack.push(fullPath);
          }
          continue;
        }

        let shouldExclude = false;
        for (const pattern of EXCLUDE_FILES) {
          const regex = new RegExp(
            "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
          );
          if (regex.test(entry.name)) {
            shouldExclude = true;
            break;
          }
        }

        if (!shouldExclude) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignorar directorios sin acceso
    }
  }

  return files;
}

function getStagedFiles() {
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACM", {
      cwd: __dirname,
      encoding: "utf-8",
    }).trim();
    return output ? output.split("\n").map((f) => resolve(__dirname, f)) : [];
  } catch {
    return [];
  }
}

function getStagedDiff(filePath) {
  try {
    return execSync(`git diff --cached "${filePath}"`, {
      cwd: __dirname,
      encoding: "utf-8",
    });
  } catch {
    return null;
  }
}

function ok(msg) {
  process.stdout.write(`${GREEN}[OK]${NC}    ${msg}\n`);
}
function warn(msg) {
  process.stdout.write(`${YELLOW}[WARN]${NC}  ${msg}\n`);
}
function fail(msg) {
  process.stdout.write(`${RED}[FAIL]${NC}  ${msg}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const stagedOnly = args.includes("--staged");
  const scanAll = args.includes("--all") || args.length === 0;

  let findings = [];
  let filesScanned = 0;

  console.log(`${CYAN}── Escaneo de secrets (hook IA) ─────────────────────────${NC}\n`);

  if (stagedOnly) {
    // Escaneo de staged files (similar al pre-commit hook)
    const stagedFiles = getStagedFiles();

    if (stagedFiles.length === 0) {
      ok("No hay archivos staged para escanear.");
      return { exitCode: 0, findings };
    }

    for (const filePath of stagedFiles) {
      const diff = getStagedDiff(filePath);
      if (!diff) continue;

      filesScanned++;
      for (const rule of SECRET_RULES) {
        const lines = diff.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.startsWith("+") || line.startsWith("+++")) continue;

          const matches = line.matchAll(rule.pattern);
          for (const match of matches) {
            findings.push({
              rule: rule.name,
              severity: rule.severity,
              file: relative(__dirname, filePath),
              line: match[0],
              matchLine: line.substring(1).trim(),
              warnOnly: rule.warnOnly || false,
            });
          }
        }
      }
    }
  }

  if (scanAll && !stagedOnly) {
    const allFiles = collectFiles(__dirname);

    for (const filePath of allFiles) {
      const relPath = relative(__dirname, filePath);

      // Saltar .env.example (es intencional)
      if (relPath === ".env.example") continue;

      try {
        const content = readFileSync(filePath, "utf-8");
        filesScanned++;

        for (const rule of SECRET_RULES) {
          const matches = content.matchAll(rule.pattern);
          for (const match of matches) {
            findings.push({
              rule: rule.name,
              severity: rule.severity,
              file: relPath,
              line: match[0],
              warnOnly: rule.warnOnly || false,
            });
          }
        }
      } catch {
        // Saltar archivos binarios o sin acceso
      }
    }
  }

  // ── Reporte ──
  console.log(`Archivos escaneados: ${filesScanned}\n`);

  const critical = findings.filter((f) => !f.warnOnly && f.severity === "CRITICAL");
  const high = findings.filter((f) => !f.warnOnly && f.severity === "HIGH");
  const low = findings.filter((f) => f.warnOnly);

  if (findings.length === 0) {
    ok("No se detectaron secrets en el código fuente.");
    return { exitCode: 0, findings };
  }

  if (critical.length > 0) {
    console.log(`${RED}⚠ SECRETS CRÍTICOS DETECTADOS (${critical.length})${NC}\n`);
    for (const f of critical) {
      console.log(`  ${RED}${f.rule}${NC} en ${CYAN}${f.file}${NC}`);
      console.log(`    ${YELLOW}${f.line.substring(0, 60)}...${NC}`);
    }
    console.log("");
  }

  if (high.length > 0) {
    console.log(`${YELLOW}⚠ SECRETS ALTO RIESGO (${high.length})${NC}\n`);
    for (const f of high) {
      console.log(`  ${YELLOW}${f.rule}${NC} en ${CYAN}${f.file}${NC}`);
      console.log(`    ${YELLOW}${f.line.substring(0, 60)}...${NC}`);
    }
    console.log("");
  }

  if (low.length > 0) {
    console.log(`${YELLOW}ℹ ADVERTENCIAS (${low.length})${NC}\n`);
    for (const f of low) {
      console.log(`  ${YELLOW}${f.rule}${NC} en ${CYAN}${f.file}${NC}`);
    }
    console.log("");
  }

  if (critical.length > 0 || high.length > 0) {
    fail("Se detectaron secrets en el código. Elimínalos antes de continuar.");
    console.log("  Usa variables de entorno (.env.local) o placeholders en su lugar.");
    return { exitCode: 1, findings };
  }

  ok("Solo advertencias o keys públicas detectadas. Continúa con precaución.");
  return { exitCode: 0, findings };
}

const result = await main();
process.exit(result.exitCode);
