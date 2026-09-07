/**
 * Прогон админки баннеров: обычная HTML-форма, как кнопка «Сохранить».
 * npm run check:banners
 */
const BASE = process.env.APP_URL ?? "http://127.0.0.1:43117";

async function publicBanners() {
  const res = await fetch(`${BASE}/api/banners`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/banners ${res.status}`);
  return (await res.json()) as Array<{ id: string; title: string; subtitle: string | null }>;
}

async function saveViaAdminForm(input: {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  background: string;
  accent: string;
  sortOrder: string;
}) {
  const body = new URLSearchParams({
    _action: "save",
    id: input.id,
    title: input.title,
    subtitle: input.subtitle,
    href: input.href,
    imageUrl: "",
    background: input.background,
    accent: input.accent,
    sortOrder: input.sortOrder,
    isActive: "on",
    startsAt: "",
    endsAt: "",
  });
  const res = await fetch(`${BASE}/api/admin/banners`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html",
    },
    body,
  });
  if (res.status !== 303) {
    const text = await res.text();
    throw new Error(`Ожидали 303, получили ${res.status}: ${text.slice(0, 240)}`);
  }
  const location = res.headers.get("location") ?? "";
  if (!location.includes("/admin/banners")) {
    throw new Error(`Редирект не на админку: ${location}`);
  }
  const admin = await fetch(new URL(location, BASE), { cache: "no-store" });
  const html = await admin.text();
  return { location, html };
}

function assert(name: string, ok: boolean, detail?: string) {
  if (!ok) {
    throw new Error(`${name}${detail ? ` — ${detail}` : ""}`);
  }
  console.log(`✓ ${name}`);
}

const first = (await publicBanners())[0];
if (!first) throw new Error("Нет баннеров");

const original = { title: first.title, subtitle: first.subtitle ?? "" };
const testTitle = `Проверка админки ${Date.now()}`;
const testSubtitle = "Подзаголовок из проверки админки";

const saved = await saveViaAdminForm({
  id: first.id,
  title: testTitle,
  subtitle: testSubtitle,
  href: "/referrals",
  background: "#0B1F0B",
  accent: "#F7F16A",
  sortOrder: "0",
});
assert("форма вернула редирект на админку", saved.location.includes("saved=1"));
assert(
  "админка показывает новый заголовок",
  saved.html.includes(testTitle),
  "в HTML после редиректа нет тестового заголовка",
);
assert(
  "админка пишет «Записано в базу»",
  saved.html.includes("Записано в базу"),
);

const after = await publicBanners();
const live = after.find((item) => item.id === first.id);
assert("главная API отдала новый заголовок", live?.title === testTitle, live?.title);
assert("главная API отдала новый текст", live?.subtitle === testSubtitle, live?.subtitle ?? "");

const home = await fetch(`${BASE}/`, { cache: "no-store" });
const homeHtml = await home.text();
assert("HTML главной содержит новый заголовок", homeHtml.includes(testTitle));

const restored = await saveViaAdminForm({
  id: first.id,
  title: original.title,
  subtitle: original.subtitle,
  href: "/referrals",
  background: "#0B1F0B",
  accent: "#F7F16A",
  sortOrder: "0",
});
assert("откат заголовка записан", restored.html.includes(original.title));

const done = (await publicBanners()).find((item) => item.id === first.id);
assert("после отката API совпадает с исходным", done?.title === original.title, done?.title);

console.log("Админка баннеров пишет и читает заголовок.");
