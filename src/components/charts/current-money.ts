import { getDashboardLabels } from "@/lib/i18n/dashboard";

const options = {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
} as const;
const usd = new Intl.NumberFormat("es-CO", options);

const signedUsd = new Intl.NumberFormat("es-CO", { ...options, signDisplay: "exceptZero" });

export function formatCurrentUsd(value: string | null, signed = false) {
  // El contrato actual solo admite decimales canónicos.
  return value === null ? getDashboardLabels().metricUnavailable : (signed ? signedUsd : usd).format(value as `${number}`);
}
