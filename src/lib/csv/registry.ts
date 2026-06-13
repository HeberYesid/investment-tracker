import type { BrokerCode } from "@/lib/reference/brokers";
import type { CsvBrokerParser } from "./types";
import { EtoroParser } from "./parsers/etoro";
import { XtbParser } from "./parsers/xtb";
import { TriiParser } from "./parsers/trii";
import { EtradingBancolombiaParser } from "./parsers/etrading-bancolombia";

const parsers: Record<BrokerCode, CsvBrokerParser> = {
  ETORO: new EtoroParser(),
  XTB: new XtbParser(),
  TRII: new TriiParser(),
  ETRADING_BANCOLOMBIA: new EtradingBancolombiaParser(),
};

export function getCsvParser(brokerCode: BrokerCode): CsvBrokerParser {
  const parser = parsers[brokerCode];
  if (!parser) {
    throw new Error(`No hay parser para el bróker: ${brokerCode}`);
  }
  return parser;
}

export { EtoroParser, XtbParser, TriiParser, EtradingBancolombiaParser };
