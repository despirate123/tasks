# 2. Структура базы данных

Полная реализация — в [`prisma/schema.prisma`](../prisma/schema.prisma). Здесь — карта предметных областей, связи и объяснение неочевидных решений.

## 2.1. Карта областей

```
ПОЛЬЗОВАТЕЛИ            ОФФЕРЫ                ВЫПОЛНЕНИЯ
users                   offer_sources         task_submissions
user_stats              offer_sync_runs       submission_proofs
user_devices            categories            submission_events
                        offers                media_assets
                        offer_steps           rejection_reasons

ДЕНЬГИ                  УВЕДОМЛЕНИЯ           РЕФЕРАЛЫ
wallets                 notifications         referral_programs
ledger_entries          notification_deliveries  referrals
payout_methods          notification_templates   referral_earnings
withdrawals             notification_preferences
withdrawal_events       broadcasts
crypto_transactions
exchange_rates

АНТИФРОД / ИНФРА
fraud_rules · fraud_flags · audit_logs · outbox_events
postback_logs · app_settings
```

## 2.2. Основные связи

```
users ─1:N─► task_submissions ─N:1─► offers ─N:1─► offer_sources
  │                 │                   └─1:N─► offer_steps
  │                 ├─1:N─► submission_proofs ─N:1─► media_assets
  │                 ├─1:N─► submission_events
  │                 └─N:1─► rejection_reasons
  │
  ├─1:N─► wallets ─1:N─► ledger_entries
  │                          ▲    ▲
  │                          │    └── submission_id (начисление за задание)
  │                          └─────── withdrawal_id (холд/выплата/возврат)
  │
  ├─1:N─► payout_methods ─1:N─► withdrawals ─1:N─► withdrawal_events
  │                                   └─1:N─► crypto_transactions
  │
  ├─1:N─► notifications ─1:N─► notification_deliveries
  ├─1:1─► referrals (как приглашённый)   ─┐
  ├─1:N─► referrals (как пригласивший)   ─┴─► referral_earnings
  ├─1:1─► user_stats
  └─N:1─► users (referrer_id, самореференс)
```

## 2.3. Ключевые решения и почему именно так

### Сложность и время одобрения: `ValueSource`

Требование «админ может вручную менять сложность и время одобрения у любого задания» конфликтует с автоматическим импортом из GetBlogger / Leadgid / Rafinad: следующий синк затрёт ручную правку.

Решение — рядом с каждым полем хранится его происхождение:

```prisma
difficulty         Difficulty  @default(MEDIUM)
difficultySource   ValueSource @default(AUTO)     // AUTO | NETWORK | MANUAL
approvalEtaMinutes Int         @default(1440)
approvalEtaSource  ValueSource @default(AUTO)
actualEtaMinutes   Int?                            // медиана факта
```

Правило синхронизатора: **`MANUAL` неприкосновенен.** Синк обновляет поле только если его `*Source` равен `AUTO` или `NETWORK`. Как только админ поправил значение в админке — `*Source` становится `MANUAL`, и автоматика к этому полю больше не прикасается. В UI админки это видно как бейдж «вручную» с кнопкой «вернуть автоматический расчёт».

`actualEtaMinutes` пересчитывается воркером как медиана `reviewedAt - submittedAt` по последним 50 одобренным выполнениям. Это даёт нам две ценные вещи: основу для честного AUTO-значения и отчёт «где мы врём пользователю» — если заявленный ETA 2 часа, а факт 30 часов, админ увидит это в списке офферов.

### Деньги: append-only леджер

`wallets.available` — это **кэш**, а не истина. Истина — `SUM(ledger_entries)`. Так делается потому, что при любом другом подходе первый же race между двумя одновременными выводами или двойной постбек от сети превращается в потерянные или задублированные деньги, а разобраться постфактум невозможно.

```prisma
model LedgerEntry {
  direction      LedgerDirection  // CREDIT | DEBIT
  type           LedgerEntryType  // TASK_REWARD | WITHDRAWAL_HOLD | ...
  amount         Decimal @db.Decimal(18, 2)
  balanceAfter   Decimal @db.Decimal(18, 2)   // для выписки и сверки
  idempotencyKey String  @unique              // "submission:{id}:reward"
}
```

Каждое движение денег имеет `idempotencyKey`, и уникальный индекс физически исключает двойное начисление. Повторный вызов ловит ошибку уникальности и трактует её как «уже начислено» — это норма, а не сбой.

Три состояния денег в `wallets`:

| Поле | Смысл |
|---|---|
| `pending` | Задание одобрено, но идёт холд (`offers.holdHours`) — защита от отмены конверсии рекламодателем |
| `available` | Холд прошёл, можно выводить |
| `hold` | Заморожено в активной заявке на вывод |

`version` в `wallets` — оптимистичная блокировка на случай конкурентных списаний.

### Снапшоты вместо ссылок там, где важна история

- `task_submissions.rewardAmount` — снапшот награды на момент взятия задания. Админ снизил ставку в оффере — уже начатые выполнения оплачиваются по старой.
- `withdrawals.methodSnapshot` + `methodKind` — снапшот реквизитов. Пользователь удалил карту — история выплат не рассыпалась.
- `withdrawals.fxRate` + `fxLockedAt` — курс RUB→USDT, зафиксированный при создании заявки, чтобы движение рынка не превращалось в спор.

### Дедупликация пруфов

```prisma
model MediaAsset {
  checksum String?   // SHA-256: тот же файл байт-в-байт
  phash    String?   // перцептивный хэш: пересжатый/обрезанный дубликат
}
```

Оба поля проиндексированы. При отправке пруфов антифрод ищет совпадения по `checksum` (мгновенно) и близкие по `phash` (расстояние Хэмминга ≤ 8). Совпадение — не автоотказ, а `FraudFlag` и подъём выполнения в приоритет очереди модерации: скриншот может совпасть и легитимно.

### Уведомления: событие отдельно от доставки

```prisma
Notification            // что произошло (одна запись на событие)
  └─ NotificationDelivery  // по каналу: IN_APP | BOT
       @@unique([notificationId, channel])
```

`@@unique([notificationId, channel])` даёт идемпотентность: воркер может ретраить доставку сколько нужно, дубликата в боте не будет. `NotificationTemplate` позволяет менять формулировки из админки без релиза. `NotificationPreference` — отписка по типам.

### Аудит: события, а не только текущий статус

`submission_events` и `withdrawal_events` — неизменяемые ленты переходов (`fromStatus` → `toStatus`, актор, комментарий, payload). Из них строятся:

- таймлайн для пользователя («что происходит с моим заданием»),
- доказательная база при споре,
- метрики скорости модерации.

`audit_logs` — то же для админских действий с `before`/`after` в JSON.

### Transactional outbox

```prisma
model OutboxEvent {
  topic       String
  payload     Json
  status      OutboxStatus  // PENDING | PROCESSING | DONE | FAILED
  availableAt DateTime      // для экспоненциального backoff
}
```

Проблема: если после `COMMIT` бизнес-транзакции упасть до постановки задачи в Redis — уведомление потеряется. Если поставить задачу до коммита, а коммит откатится — пользователь получит сообщение о событии, которого не было.

Outbox решает и то и другое: запись в `outbox_events` идёт **в той же транзакции**, что и бизнес-данные. Воркер разгребает очередь отдельно. Гарантия — at-least-once, а идемпотентность на стороне доставки превращает её в фактическое exactly-once.

## 2.4. Индексы

Расставлены под конкретные запросы, а не «на всякий случай»:

| Индекс | Обслуживает |
|---|---|
| `offers(status, priority DESC)` | каталог заданий, главный экран |
| `offers(difficulty, status)`, `offers(categoryId, status)` | фильтры каталога |
| `offers(sourceId, externalId)` UNIQUE | идемпотентность синка |
| `task_submissions(status, submittedAt)` | очередь модерации (FIFO) |
| `task_submissions(status, reviewDeadlineAt)` | алерты по нарушенному SLA |
| `task_submissions(status, payoutAvailableAt)` | воркер снятия холда |
| `task_submissions(userId, status)` | экран «мои задания» |
| `ledger_entries(userId, createdAt DESC)` | история операций |
| `ledger_entries(idempotencyKey)` UNIQUE | защита от двойного начисления |
| `notifications(userId, readAt, createdAt DESC)` | счётчик непрочитанных |
| `withdrawals(status, requestedAt)` | очередь выплат |
| `crypto_transactions(network, txHash)` UNIQUE | идемпотентность крипто-вебхуков |
| `media_assets(checksum)`, `media_assets(phash)` | поиск дубликатов пруфов |
| `user_devices(fingerprint)`, `user_devices(ip)` | детект мультиаккаунтов |

## 2.5. Что делать при росте

- **`ledger_entries`** и **`submission_events`** — партиционирование по месяцам (`RANGE` по `createdAt`), когда перевалит за ~50 млн строк.
- **`notifications`** — TTL-очистка: прочитанные старше 90 дней и `expiresAt` в прошлом удаляются воркером.
- **`postback_logs`** — самая быстрорастущая и наименее ценная таблица; хранение 30 дней, дальше в S3/ClickHouse.
- **Аналитика** — read-replica; тяжёлые отчёты не должны конкурировать с продовыми запросами.
- **`user_stats` и денормализованная статистика офферов** — пересчёт воркером, а не триггерами: триггеры на горячих таблицах превращаются в невидимые локи.

## 2.6. Справочные данные (сиды)

| Таблица | Начальное содержимое |
|---|---|
| `offer_sources` | GetBlogger, Leadgid, Rafinad, Manual |
| `categories` | Финансы, Маркетплейсы, Приложения, Подписки, Опросы, Игры |
| `rejection_reasons` | нечитаемый скриншот, нет обязательного пруфа, чужой аккаунт, дубликат, действие не выполнено, истёк срок, подозрение на фрод |
| `referral_programs` | L1 — 10 %, L2 — 3 % |
| `notification_templates` | по одному на каждый `NotificationType` × канал |
| `fraud_rules` | дубликат медиа, всплеск за час, общий IP/устройство, свежий аккаунт + дорогой оффер, серия отказов |
| `app_settings` | минимальная сумма вывода, комиссии, суточные лимиты, размер холда по умолчанию |
