const COUNTRY_TRANSLATIONS: Record<string, string> = {
  "United States": "Estados Unidos",
  "United States of America": "Estados Unidos",
  USA: "Estados Unidos",
  US: "Estados Unidos",
  Canada: "Canadá",
  Mexico: "México",
  "United Kingdom": "Reino Unido",
  UK: "Reino Unido",
  "Great Britain": "Reino Unido",
  England: "Reino Unido",
  Germany: "Alemania",
  France: "Francia",
  Spain: "España",
  Italy: "Italia",
  Netherlands: "Países Bajos",
  Belgium: "Bélgica",
  Switzerland: "Suiza",
  Sweden: "Suecia",
  Norway: "Noruega",
  Denmark: "Dinamarca",
  Finland: "Finlandia",
  Ireland: "Irlanda",
  Portugal: "Portugal",
  Poland: "Polonia",
  Austria: "Austria",
  Greece: "Grecia",
  "Czech Republic": "República Checa",
  Hungary: "Hungría",
  Russia: "Rusia",
  Turkey: "Turquía",
  Israel: "Israel",
  "United Arab Emirates": "Emiratos Árabes Unidos",
  "Saudi Arabia": "Arabia Saudita",
  "South Africa": "Sudáfrica",
  Egypt: "Egipto",
  Nigeria: "Nigeria",
  Kenya: "Kenia",
  Brazil: "Brasil",
  Argentina: "Argentina",
  Chile: "Chile",
  Colombia: "Colombia",
  Peru: "Perú",
  "Perú": "Perú",
  Venezuela: "Venezuela",
  Ecuador: "Ecuador",
  Uruguay: "Uruguay",
  Paraguay: "Paraguay",
  Bolivia: "Bolivia",
  "Costa Rica": "Costa Rica",
  Panama: "Panamá",
  "Dominican Republic": "República Dominicana",
  Japan: "Japón",
  China: "China",
  "Hong Kong": "Hong Kong",
  Taiwan: "Taiwán",
  "South Korea": "Corea del Sur",
  Korea: "Corea del Sur",
  India: "India",
  Indonesia: "Indonesia",
  Malaysia: "Malasia",
  Singapore: "Singapur",
  Philippines: "Filipinas",
  Thailand: "Tailandia",
  Vietnam: "Vietnam",
  Australia: "Australia",
  "New Zealand": "Nueva Zelanda",
};

const SECTOR_TRANSLATIONS: Record<string, string> = {
  Technology: "Tecnología",
  "Information Technology": "Tecnología",
  Healthcare: "Salud",
  "Health Care": "Salud",
  "Financial Services": "Servicios financieros",
  Finance: "Servicios financieros",
  "Consumer Cyclical": "Consumo cíclico",
  "Consumer Discretionary": "Consumo discrecional",
  "Consumer Defensive": "Consumo defensivo",
  "Consumer Staples": "Consumo básico",
  Industrials: "Industrial",
  Energy: "Energía",
  Utilities: "Servicios públicos",
  "Real Estate": "Inmobiliario",
  "Basic Materials": "Materiales básicos",
  Materials: "Materiales",
  "Communication Services": "Comunicaciones",
  Telecommunications: "Telecomunicaciones",
};

const UNCLASSIFIED_LABEL = "Sin clasificar";

function normalize(value: string): string {
  return value.trim();
}

export function translateCountry(raw: string | null | undefined): string {
  if (raw == null) return UNCLASSIFIED_LABEL;
  const trimmed = normalize(raw);
  if (trimmed.length === 0) return UNCLASSIFIED_LABEL;
  const direct = COUNTRY_TRANSLATIONS[trimmed];
  if (direct) return direct;
  const lowered = COUNTRY_TRANSLATIONS[trimmed.toLowerCase()];
  if (lowered) return lowered;
  return trimmed;
}

export function translateSector(raw: string | null | undefined): string {
  if (raw == null) return UNCLASSIFIED_LABEL;
  const trimmed = normalize(raw);
  if (trimmed.length === 0) return UNCLASSIFIED_LABEL;
  const direct = SECTOR_TRANSLATIONS[trimmed];
  if (direct) return direct;
  const lowered = SECTOR_TRANSLATIONS[trimmed.toLowerCase()];
  if (lowered) return lowered;
  return trimmed;
}

export const UNCLASSIFIED = UNCLASSIFIED_LABEL;
