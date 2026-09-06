#!/usr/bin/env node
/**
 * Однокомандный запуск проекта локально: npm run setup
 *
 * Скрипт на Node, а не на bash, чтобы одинаково работал на macOS, Linux
 * и Windows без установки дополнительных инструментов.
 *
 * Что делает:
 *  1. Проверяет версию Node.
 *  2. Создаёт .env из .env.example и генерирует настоящие секреты.
 *  3. Проверяет доступность PostgreSQL; если порт закрыт — пробует поднять
 *     контейнер из docker-compose.yml.
 *  4. Генерирует клиент Prisma, накатывает схему, заливает демо-данные.
 *
 * Скрипт идемпотентен: повторный запуск ничего не ломает и не перезаписывает
 * существующий .env.
 */

import { execFileSync, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const envExamplePath = path.join(root, ".env.example");

const color = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
};

let step = 0;
const info = (msg) => console.log(`${color.cyan}▸${color.reset} ${msg}`);
const ok = (msg) => console.log(`${color.green}✓${color.reset} ${msg}`);
const warn = (msg) => console.log(`${color.yellow}!${color.reset} ${msg}`);
const heading = (msg) => {
  step += 1;
  console.log(`\n${color.bold}${step}. ${msg}${color.reset}`);
};

function fail(title, lines = []) {
  console.error(`\n${color.red}${color.bold}✗ ${title}${color.reset}`);
  for (const line of lines) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

/**
 * Windows не запускает `npx`/`prisma` через execFileSync: это .cmd-файлы.
 * Берём локальный бинарник из node_modules/.bin, иначе имя с суффиксом .cmd.
 */
function resolveCommand(command) {
  if (process.platform !== "win32") return command;
  if (/[\\/]/.test(command) || path.extname(command)) return command;

  const localCmd = path.join(root, "node_modules", ".bin", `${command}.cmd`);
  if (existsSync(localCmd)) return localCmd;

  return `${command}.cmd`;
}

function run(command, args, options = {}) {
  return execFileSync(resolveCommand(command), args, {
    cwd: root,
    stdio: options.quiet ? "pipe" : "inherit",
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
  });
}

function has(command) {
  try {
    execSync(
      process.platform === "win32" ? `where ${command}` : `command -v ${command}`,
      { stdio: "ignore", shell: true },
    );
    return true;
  } catch {
    return false;
  }
}

/** Проверка, что TCP-порт принимает соединения. */
function probePort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

function parseDatabaseUrl(raw) {
  try {
    const url = new URL(raw);
    return {
      host: url.hostname || "127.0.0.1",
      port: Number(url.port || 5432),
      user: decodeURIComponent(url.username || ""),
      password: decodeURIComponent(url.password || ""),
      database: url.pathname.replace(/^\//, "") || "postgres",
    };
  } catch {
    return null;
  }
}

function readEnv() {
  if (!existsSync(envPath)) return {};
  const result = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    result[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return result;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── 1. Node ──────────────────────────────────────────────────────────────────

console.log(`${color.bold}Настройка ProfiBux${color.reset}`);

heading("Проверка окружения");

const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  fail(`Нужен Node.js 20 или новее, а установлен ${process.versions.node}`, [
    "Обновите Node: https://nodejs.org или через nvm:",
    `${color.dim}nvm install 22 && nvm use 22${color.reset}`,
  ]);
}
ok(`Node.js ${process.versions.node}`);

if (!existsSync(path.join(root, "node_modules"))) {
  fail("Зависимости не установлены", [
    `Выполните ${color.bold}npm install${color.reset} и запустите скрипт снова.`,
  ]);
}
ok("Зависимости установлены");

// ── 2. .env ──────────────────────────────────────────────────────────────────

heading("Файл .env");

if (existsSync(envPath)) {
  ok(".env уже есть — оставляю как есть");
} else {
  if (!existsSync(envExamplePath)) {
    fail("Не найден .env.example — репозиторий скачан не полностью");
  }
  const template = readFileSync(envExamplePath, "utf8")
    // Настоящие секреты вместо заглушек: подпись сессий и шифрование
    // реквизитов не должны работать на значении из примера.
    .replace(
      /^AUTH_SECRET=.*$/m,
      `AUTH_SECRET="${randomBytes(32).toString("hex")}"`,
    )
    .replace(
      /^PAYOUT_ENCRYPTION_KEY=.*$/m,
      `PAYOUT_ENCRYPTION_KEY="${randomBytes(32).toString("hex")}"`,
    );
  writeFileSync(envPath, template);
  ok(".env создан из .env.example, секреты сгенерированы");
}

const env = readEnv();
const databaseUrl = env.DATABASE_URL ?? "";
const db = parseDatabaseUrl(databaseUrl);

if (!db) {
  fail("DATABASE_URL в .env выглядит некорректно", [
    `Текущее значение: ${databaseUrl || "(пусто)"}`,
    "Ожидается вид: postgresql://profibux:profibux@127.0.0.1:5432/profibux",
  ]);
}

// ── 3. PostgreSQL ────────────────────────────────────────────────────────────

heading("PostgreSQL");

info(`Проверяю ${db.host}:${db.port}…`);
let reachable = await probePort(db.host, db.port);

if (reachable) {
  ok(`PostgreSQL отвечает на ${db.host}:${db.port}`);
} else {
  warn(`На ${db.host}:${db.port} никто не отвечает`);

  const dockerAvailable = has("docker");
  let composeWorks = false;
  if (dockerAvailable) {
    try {
      run("docker", ["compose", "version"], { quiet: true });
      composeWorks = true;
    } catch {
      composeWorks = false;
    }
  }

  if (composeWorks) {
    info("Поднимаю PostgreSQL через docker compose…");
    try {
      run("docker", ["compose", "up", "-d", "postgres"]);
    } catch {
      fail("Не удалось запустить контейнер PostgreSQL", [
        "Проверьте, что Docker Desktop / docker daemon запущен, и повторите.",
      ]);
    }

    info("Ожидаю готовности базы…");
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await sleep(1000);
      reachable = await probePort(db.host, db.port);
      if (reachable) break;
    }

    if (!reachable) {
      fail("PostgreSQL так и не поднялся за 40 секунд", [
        `Посмотрите логи: ${color.bold}docker compose logs postgres${color.reset}`,
      ]);
    }
    ok("PostgreSQL в Docker готов");
  } else {
    fail("PostgreSQL недоступен, и Docker не найден", [
      "",
      `${color.bold}Вариант 1 — Docker (проще всего):${color.reset}`,
      "  Установите Docker Desktop: https://docs.docker.com/get-docker/",
      `  затем ${color.bold}docker compose up -d${color.reset} и запустите скрипт снова.`,
      "",
      `${color.bold}Вариант 2 — свой PostgreSQL:${color.reset}`,
      "  macOS:   brew install postgresql@16 && brew services start postgresql@16",
      "  Ubuntu:  sudo apt install postgresql && sudo systemctl start postgresql",
      "  Windows: https://www.postgresql.org/download/windows/",
      "",
      "  Затем создайте роль и базу:",
      `  ${color.dim}psql -U postgres -c "CREATE ROLE ${db.user} WITH LOGIN PASSWORD '${db.password}' SUPERUSER;"${color.reset}`,
      `  ${color.dim}psql -U postgres -c "CREATE DATABASE ${db.database} OWNER ${db.user};"${color.reset}`,
      "",
      "  Если PostgreSQL уже есть со своими логином и паролем — просто",
      "  поправьте DATABASE_URL в .env под них.",
    ]);
  }
}

// ── 4. Схема и данные ────────────────────────────────────────────────────────

heading("Схема базы и демо-данные");

info("Генерирую клиент Prisma…");
try {
  run("prisma", ["generate"], { quiet: true });
  ok("Клиент Prisma сгенерирован");
} catch (error) {
  fail("Не удалось сгенерировать клиент Prisma", [
    String(error.stderr ?? error.message ?? error).split("\n").slice(-6).join("\n  "),
  ]);
}

/**
 * Роль и база из DATABASE_URL, если их ещё нет.
 *
 * Способ подключения суперпользователя зависит от того, как установлен
 * PostgreSQL, поэтому пробуем варианты по очереди: Homebrew на macOS отдаёт
 * суперюзера текущему пользователю ОС, в пакетах Linux это системная роль
 * postgres, в установщике под Windows — роль postgres с паролем.
 */
function provisionDatabase() {
  if (!has("psql")) return false;

  const statements = [
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${db.user}') THEN CREATE ROLE ${db.user} WITH LOGIN CREATEDB PASSWORD '${db.password}'; END IF; END $$;`,
    `ALTER ROLE ${db.user} WITH LOGIN CREATEDB PASSWORD '${db.password}';`,
  ];

  const strategies = [
    { label: "psql текущим пользователем", command: "psql", args: [] },
    { label: "psql -U postgres", command: "psql", args: ["-U", "postgres"] },
    ...(process.platform === "win32"
      ? []
      : [
          {
            label: "sudo -u postgres psql",
            command: "sudo",
            args: ["-n", "-u", "postgres", "psql"],
          },
        ]),
  ];

  for (const strategy of strategies) {
    try {
      for (const sql of statements) {
        execFileSync(
          strategy.command,
          [...strategy.args, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql],
          { cwd: root, stdio: "pipe", encoding: "utf8", env: process.env },
        );
      }

      // CREATE DATABASE нельзя выполнить внутри DO-блока, поэтому отдельно
      // и с игнорированием ошибки «база уже существует».
      try {
        execFileSync(
          strategy.command,
          [
            ...strategy.args,
            "-d",
            "postgres",
            "-c",
            `CREATE DATABASE ${db.database} OWNER ${db.user};`,
          ],
          { cwd: root, stdio: "pipe", encoding: "utf8", env: process.env },
        );
      } catch (error) {
        const message = String(error.stderr ?? "");
        if (!/already exists/i.test(message)) throw error;
      }

      ok(`Роль и база созданы (${strategy.label})`);
      return true;
    } catch {
      // Пробуем следующий способ подключения.
    }
  }

  return false;
}

function pushSchema() {
  run("prisma", ["db", "push", "--skip-generate", "--accept-data-loss"], {
    quiet: true,
  });
}

info("Накатываю схему…");
try {
  pushSchema();
  ok("Схема применена");
} catch (error) {
  const details = String(error.stderr ?? error.stdout ?? error.message ?? error);
  const isAuthOrMissingDb =
    /authentication failed|password|does not exist|database .* not found/i.test(
      details,
    );

  if (!isAuthOrMissingDb) {
    fail("Не удалось применить схему", [details.split("\n").slice(-8).join("\n  ")]);
  }

  warn(`Роль «${db.user}» или база «${db.database}» отсутствуют — создаю`);

  if (!provisionDatabase()) {
    fail("Не получилось создать роль и базу автоматически", [
      `Нужны роль ${color.bold}${db.user}${color.reset} и база ${color.bold}${db.database}${color.reset}.`,
      "",
      "Создайте их вручную (замените postgres на своего суперпользователя):",
      `  ${color.dim}psql -U postgres -c "CREATE ROLE ${db.user} WITH LOGIN CREATEDB PASSWORD '${db.password}';"${color.reset}`,
      `  ${color.dim}psql -U postgres -c "CREATE DATABASE ${db.database} OWNER ${db.user};"${color.reset}`,
      "",
      "Либо поправьте DATABASE_URL в .env под уже существующие у вас логин и пароль",
      "и запустите npm run setup снова.",
      "",
      `Самый простой путь без ручной настройки — Docker: ${color.bold}docker compose up -d${color.reset}`,
    ]);
  }

  info("Повторяю накат схемы…");
  try {
    pushSchema();
    ok("Схема применена");
  } catch (retryError) {
    fail("Схема не применилась даже после создания базы", [
      String(retryError.stderr ?? retryError.stdout ?? retryError.message ?? retryError)
        .split("\n")
        .slice(-8)
        .join("\n  "),
    ]);
  }
}

info("Заливаю демо-данные…");
try {
  run("tsx", ["prisma/seed.ts"], { quiet: true });
  ok("Демо-данные готовы");
} catch (error) {
  fail("Не удалось залить демо-данные", [
    String(error.stderr ?? error.stdout ?? error.message ?? error)
      .split("\n")
      .slice(-8)
      .join("\n  "),
  ]);
}

// ── Готово ───────────────────────────────────────────────────────────────────

console.log(`
${color.green}${color.bold}Готово.${color.reset} Запускайте приложение:

  ${color.bold}npm run dev${color.reset}

Затем откройте в браузере:

  Mini App      ${color.cyan}http://localhost:43117${color.reset}
  Админ-панель  ${color.cyan}http://localhost:43117/admin${color.reset}

${color.dim}Вход не нужен: DEV_AUTH_BYPASS=true подставляет демо-пользователя
Алексея Смирнова с ролью OWNER, поэтому доступны и Mini App, и админка.

Чтобы посмотреть глазами обычного участника, поменяйте в .env
DEV_USER_TELEGRAM_ID на 777000002 и перезапустите dev-сервер.

Фоновые задачи (снятие холда, автоодобрение) — в отдельном терминале:
  npm run workers${color.reset}
`);
