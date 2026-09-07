import { cn } from "@/lib/utils";
import { formatMoney, formatMoneySigned } from "@/lib/format";

type MoneyValue = Parameters<typeof formatMoney>[0];

/**
 * «1 250 ₽» → сумма и знак в разных узлах.
 * На телефоне WebKit иначе переносит «₽» или роняет его ниже цифр:
 * в Geist нет U+20BD, системный глиф выше строчного ящика.
 */
const MONEY_TAIL = /^([\u2212+]?)(.*?)(?:\u00A0|\s)(₽|USDT|%)$/;

export function MoneyText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const match = text.match(MONEY_TAIL);
  if (!match) {
    return <span className={cn("tabular", className)}>{text}</span>;
  }

  return (
    <span className={cn("money", className)}>
      <span>{match[1]}{match[2]}</span>
      <span className="money-curr">{match[3]}</span>
    </span>
  );
}

export function Money({
  value,
  currency,
  signed = false,
  className,
}: {
  value: MoneyValue;
  currency?: string;
  signed?: boolean;
  className?: string;
}) {
  const text = signed
    ? formatMoneySigned(value, currency)
    : formatMoney(value, currency);
  return <MoneyText text={text} className={className} />;
}

export function asMoneyNode(value: React.ReactNode) {
  if (typeof value === "string" && /(?:₽|USDT|%)\s*$/.test(value)) {
    return <MoneyText text={value} />;
  }
  if (typeof value === "number") {
    return <span className="tabular">{value}</span>;
  }
  return value;
}
