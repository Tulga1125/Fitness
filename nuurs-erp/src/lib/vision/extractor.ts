import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { Extraction } from "./schema";
import { sampleUnloadTicket } from "./sample";

export type ImageInput = { data: Buffer; mimeType: string };

/** Reads a document photo. Real (Claude) and mock implementations share this interface. */
export interface VisionExtractor {
  extract(image: ImageInput): Promise<{ extraction: Extraction; raw: unknown }>;
}

const INSTRUCTIONS = `You read photos that truck drivers of a Mongolian coal-trucking company send.
Classify the photo, then read its fields exactly as printed.

document_type:
- weigh_ticket: a printed weighbridge ticket (пүүний баримт / падаан). Fill "ticket", leave "fuel" null.
- fuel_receipt: a fuel station receipt. Fill "fuel".
- pump_meter: a photo of a fuel pump display (litres, price, amount). Fill "fuel".
- other: anything else. Leave both null.

Weighbridge ticket labels (Mongolian, Cyrillic): пүүний оператор (operator_name), баримтын дугаар (ticket_no),
илгээгч (consignor), худалдан авагч (buyer), тээвэрлэгч (carrier), төрөл: БУУЛГАЛТ = UNLOAD, АЧИЛТ = LOAD (kind),
огноо (ticket_datetime), бүтээгдэхүүн (product), толгойн дугаар (tractor_plate), орсон цаг (time_in),
гарсан цаг (time_out), орсон жин (weight_in_kg), гарсан жин (weight_out_kg), ачаа жин / цэвэр жин (net_kg),
чингэлэг (container_no), жолооч — name, register number and phone in one comma-separated field (driver_combined),
чиргүүл — two trailer plates on two lines (trailer_plate_1, trailer_plate_2), гэрээний дугаар (contract_no),
ачих газар (loading_place), хүрэх газар (destination), С зөвшөөрөл (c_permit), лац (seal_no),
хэвлэсэн огноо (printed_at), пүүлэгч (weigher_name).

Rules:
- Never invent a value. If a field is unreadable or absent, return null.
- Weights are integers in kilograms. Dates as "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS".
- confidence is 0..1. Use below 0.8 whenever you are unsure, and list in obscured_fields every field
  a round stamp, fold or glare covers (the stamp often covers contract_no and loading_place).
- Copy plates and numbers character by character; Cyrillic letters in plates include Ө and Ү.`;

class ClaudeExtractor implements VisionExtractor {
  private client = new Anthropic();
  constructor(private model: string) {}

  async extract(image: ImageInput) {
    const mediaType = image.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(Extraction) },
      system: INSTRUCTIONS,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image.data.toString("base64") } },
            { type: "text", text: "Read this photo." },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new Error("Vision model declined to read this image");
    if (response.stop_reason === "max_tokens") throw new Error("Vision output was cut off");
    if (!response.parsed_output) throw new Error("Vision output did not match the schema");
    return { extraction: response.parsed_output, raw: response.content };
  }
}

/** Returns the sample unloading ticket for any image, so the whole flow runs without an API key. */
class MockExtractor implements VisionExtractor {
  async extract() {
    const extraction = sampleUnloadTicket();
    return { extraction, raw: { mock: true, extraction } };
  }
}

export function getExtractor(): VisionExtractor {
  if (process.env.VISION_PROVIDER === "claude") {
    const model = process.env.VISION_MODEL;
    if (!model) throw new Error("VISION_MODEL is not set");
    return new ClaudeExtractor(model);
  }
  return new MockExtractor();
}
