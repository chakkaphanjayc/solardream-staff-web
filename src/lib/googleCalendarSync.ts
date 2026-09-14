import { calendar_v3 } from "googleapis";
import { getCalendarClient } from "@/lib/google-client";

export type BookingCalendarData = {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  notes?: string;
  bookingType: "PM_VISIT" | "REMOTE_CONSULTATION" | "FIELD_REPAIR";
  scheduledStartTime: string; // ISO 8601 string
  scheduledEndTime?: string; // ISO 8601 string
  technicianEmail?: string;
};

export type CalendarSyncResult = {
  success: boolean;
  googleEventId?: string;
  hangoutsLink?: string;
  htmlLink?: string;
  error?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function createCalendarEvent(bookingData: BookingCalendarData): Promise<CalendarSyncResult> {
  try {
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

    const startDateTime = new Date(bookingData.scheduledStartTime);
    const endDateTime = bookingData.scheduledEndTime
      ? new Date(bookingData.scheduledEndTime)
      : new Date(startDateTime.getTime() + 60 * 60 * 1000); // Default 1 hour duration

    const isRemote = bookingData.bookingType === "REMOTE_CONSULTATION";
    const summary = isRemote
      ? `[SolarDream Remote Consultation] ${bookingData.customerName}`
      : `[SolarDream PM Visit] ${bookingData.customerName}`;

    const description = [
      `SolarDream Service Booking`,
      `----------------------------------------`,
      `Customer Name: ${bookingData.customerName}`,
      `Phone: ${bookingData.customerPhone || "N/A"}`,
      `Email: ${bookingData.customerEmail || "N/A"}`,
      `Address: ${bookingData.customerAddress || "N/A"}`,
      `Booking Type: ${bookingData.bookingType}`,
      `Notes: ${bookingData.notes || "None"}`,
      `----------------------------------------`,
      `Organized via SolarDream Operations Desk`,
    ].join("\n");

    const attendees: calendar_v3.Schema$EventAttendee[] = [];
    if (bookingData.technicianEmail) {
      attendees.push({ email: bookingData.technicianEmail });
    }
    if (bookingData.customerEmail) {
      attendees.push({ email: bookingData.customerEmail });
    }

    const eventRequestBody: calendar_v3.Schema$Event = {
      summary,
      description,
      location: bookingData.customerAddress || "Chiangmai, Thailand",
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: "Asia/Bangkok",
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: "Asia/Bangkok",
      },
      attendees,
    };

    if (isRemote) {
      eventRequestBody.conferenceData = {
        createRequest: {
          requestId: `solardream-meet-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    const response = await calendar.events.insert({
      calendarId,
      requestBody: eventRequestBody,
      conferenceDataVersion: isRemote ? 1 : 0,
    });

    const createdEvent = response.data;

    return {
      success: true,
      googleEventId: createdEvent.id || undefined,
      hangoutsLink: createdEvent.hangoutLink || createdEvent.conferenceData?.entryPoints?.[0]?.uri || undefined,
      htmlLink: createdEvent.htmlLink || undefined,
    };
  } catch (error: unknown) {
    console.error("[createCalendarEvent Error]", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to create Google Calendar event."),
    };
  }
}

export async function updateCalendarEvent(
  eventId: string,
  updateData: Partial<BookingCalendarData>
): Promise<CalendarSyncResult> {
  try {
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

    const eventPatch: calendar_v3.Schema$Event = {};

    if (updateData.customerName) {
      eventPatch.summary = `[SolarDream Service] ${updateData.customerName}`;
    }
    if (updateData.scheduledStartTime) {
      const start = new Date(updateData.scheduledStartTime);
      const end = updateData.scheduledEndTime
        ? new Date(updateData.scheduledEndTime)
        : new Date(start.getTime() + 60 * 60 * 1000);

      eventPatch.start = { dateTime: start.toISOString(), timeZone: "Asia/Bangkok" };
      eventPatch.end = { dateTime: end.toISOString(), timeZone: "Asia/Bangkok" };
    }

    const response = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: eventPatch,
    });

    return {
      success: true,
      googleEventId: response.data.id || eventId,
      htmlLink: response.data.htmlLink || undefined,
    };
  } catch (error: unknown) {
    console.error("[updateCalendarEvent Error]", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to patch Google Calendar event."),
    };
  }
}

export async function cancelCalendarEvent(eventId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

    await calendar.events.delete({
      calendarId,
      eventId,
    });

    return { success: true };
  } catch (error: unknown) {
    console.error("[cancelCalendarEvent Error]", error);
    return { success: false, error: getErrorMessage(error, "Failed to delete Google Calendar event.") };
  }
}
