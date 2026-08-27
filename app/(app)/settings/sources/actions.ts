"use server";

import { revalidatePath } from "next/cache";
import { ingestLead, IngestInput } from "@/lib/inbound/ingest";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function simulateTestLead(
  channel: "google_ads" | "meta_ads" | "website_form",
  data: {
    email: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    phone?: string;
    sector?: string;
    city?: string;
    sourceDetail?: string;
  }
) {
  await requireRole("ADMIN", "OWNER");

  if (!data.email?.trim()) {
    throw new Error("Email address is required for test lead.");
  }

  // Construct raw mock payload matching channel's native webhook shape
  let rawPayload: any;
  if (channel === "google_ads") {
    rawPayload = {
      lead_id: `test_g_${Date.now()}`,
      campaign_id: data.sourceDetail || "123456789",
      google_key: "test_key",
      user_column_data: [
        { column_name: "EMAIL", string_value: data.email.trim() },
        { column_name: "FIRST_NAME", string_value: data.firstName?.trim() },
        { column_name: "LAST_NAME", string_value: data.lastName?.trim() },
        { column_name: "COMPANY_NAME", string_value: data.company?.trim() },
        { column_name: "PHONE_NUMBER", string_value: data.phone?.trim() },
        { column_name: "CITY", string_value: data.city?.trim() },
      ].filter((col) => col.string_value),
    };
  } else if (channel === "meta_ads") {
    rawPayload = {
      entry: [
        {
          id: `page_${Date.now()}`,
          time: Math.floor(Date.now() / 1000),
          changes: [
            {
              field: "leadgen",
              value: {
                leadgen_id: `test_meta_${Date.now()}`,
                form_id: "test_form_999",
                page_id: "test_page_111",
                field_data: [
                  { name: "email", values: [data.email.trim()] },
                  { name: "first_name", values: [data.firstName?.trim()].filter(Boolean) },
                  { name: "last_name", values: [data.lastName?.trim()].filter(Boolean) },
                  { name: "company_name", values: [data.company?.trim()].filter(Boolean) },
                  { name: "phone_number", values: [data.phone?.trim()].filter(Boolean) },
                  { name: "city", values: [data.city?.trim()].filter(Boolean) },
                ],
              },
            },
          ],
        },
      ],
    };
  } else {
    rawPayload = {
      email: data.email.trim(),
      firstName: data.firstName?.trim(),
      lastName: data.lastName?.trim(),
      company: data.company?.trim(),
      phone: data.phone?.trim(),
      city: data.city?.trim(),
      sector: data.sector?.trim(),
      timestamp: new Date().toISOString(),
    };
  }

  const ingestInput: IngestInput = {
    channel,
    email: data.email.trim(),
    firstName: data.firstName?.trim(),
    lastName: data.lastName?.trim(),
    company: data.company?.trim(),
    phone: data.phone?.trim(),
    sector: data.sector?.trim(),
    city: data.city?.trim(),
    sourceDetail: data.sourceDetail?.trim() || `test_simulation_${channel}`,
    raw: rawPayload,
  };

  const result = await ingestLead(ingestInput);
  revalidatePath("/settings/sources");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/");
  return result;
}

export async function deleteInboundLog(logId: string) {
  await requireRole("ADMIN", "OWNER");
  await prisma.inboundLeadLog.delete({ where: { id: logId } });
  revalidatePath("/settings/sources");
}
