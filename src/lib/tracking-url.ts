function hasPlaceholder(url: string) {
  return /\{click_?id\}|\{sub_?id\}/i.test(url);
}

export function trackingHasPlaceholder(url: string) {
  return hasPlaceholder(url);
}

/**
 * Уникальная ссылка выполнения: без своего clickId сеть не засчитает конверсию.
 * Если в шаблоне нет плейсхолдера — дописываем sub_id.
 */
export function resolveTrackingUrl(template: string, clickId: string): string {
  if (!template.trim()) return "";
  if (hasPlaceholder(template)) {
    return template.replace(/\{click_?id\}|\{sub_?id\}/gi, encodeURIComponent(clickId));
  }
  try {
    const url = new URL(template);
    if (!url.searchParams.has("sub_id") && !url.searchParams.has("click_id")) {
      url.searchParams.set("sub_id", clickId);
    }
    return url.toString();
  } catch {
    const join = template.includes("?") ? "&" : "?";
    return `${template}${join}sub_id=${encodeURIComponent(clickId)}`;
  }
}

export function submissionClickId(submission: {
  clickId: string | null;
  publicCode: string;
}) {
  return submission.clickId ?? submission.publicCode;
}
